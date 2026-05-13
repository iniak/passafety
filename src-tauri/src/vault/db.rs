//! SQLite database operations for vault storage
//!
//! Manages password entries, groups, and master record in SQLite database.
//! Schema is compatible with the Python implementation.

use rusqlite::{Connection, params, Row};
use thiserror::Error;
use std::path::Path;
use std::fs;

use crate::vault::crypto::{VaultCrypto, EncryptedData, MasterRecord, CryptoError, SALT_SIZE, NONCE_SIZE, TAG_SIZE, ITERATIONS};

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Vault not initialized")]
    NotInitialized,
    #[error("Vault is locked")]
    VaultLocked,
    #[error("Invalid master record format")]
    InvalidMasterRecord,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("CSV error: {0}")]
    Csv(String),
    #[error("Encoding error: {0}")]
    Encoding(String),
    #[error("Crypto error: {0}")]
    Crypto(#[from] CryptoError),
}

impl From<csv::Error> for DatabaseError {
    fn from(e: csv::Error) -> Self {
        DatabaseError::Csv(e.to_string())
    }
}

/// Password entry (decrypted form for frontend)
#[derive(Debug, Clone)]
pub struct Entry {
    pub id: i32,
    pub website: String,
    pub username: String,
    pub password: String,
    pub comment: String,
    pub group: String,
}

/// Group with entry count
#[derive(Debug, Clone)]
pub struct Group {
    pub name: String,
    pub count: i32,
}

/// Internal entry record from database (encrypted)
struct EntryRecord {
    id: i32,
    website: String,
    username: String,
    password_encrypted: Vec<u8>,
    nonce: Vec<u8>,
    tag: Vec<u8>,
    comment: Option<String>,
    group: String,
}

/// Database handler for vault operations
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Open or create database at specified path
    pub fn open(path: &Path) -> Result<Self, DatabaseError> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.init_tables()?;
        Ok(db)
    }

    /// Initialize database tables with compatible schema
    fn init_tables(&self) -> Result<(), DatabaseError> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS master (
                id INTEGER PRIMARY KEY,
                salt BLOB,
                iterations INTEGER,
                test_password_encrypted BLOB,
                test_nonce BLOB,
                test_tag BLOB,
                password_hint TEXT
            );

            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );

            CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                website TEXT NOT NULL,
                username TEXT NOT NULL,
                password_encrypted BLOB NOT NULL,
                nonce BLOB NOT NULL,
                tag BLOB NOT NULL,
                comment TEXT,
                `group` TEXT DEFAULT '默认分组',
                position INTEGER DEFAULT 0
            );

            INSERT OR IGNORE INTO groups (name) VALUES ('默认分组');
            "#,
        )?;

        // Run migrations for older databases
        self.migrate_columns()?;

        // Migrate old '未分组' to '默认分组'
        self.conn.execute(
            "UPDATE entries SET `group` = '默认分组' WHERE `group` = '未分组'",
            [],
        )?;
        self.conn.execute(
            "DELETE FROM groups WHERE name = '未分组'",
            [],
        )?;

        Ok(())
    }

    /// Add missing columns for compatibility with older databases
    fn migrate_columns(&self) -> Result<(), DatabaseError> {
        // Check master table columns
        let master_columns: Vec<String> = self.conn
            .prepare("PRAGMA table_info(master)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;

        if !master_columns.iter().any(|c| c == "test_nonce") {
            self.conn.execute("ALTER TABLE master ADD COLUMN test_nonce BLOB", [])?;
        }
        if !master_columns.iter().any(|c| c == "test_tag") {
            self.conn.execute("ALTER TABLE master ADD COLUMN test_tag BLOB", [])?;
        }
        if !master_columns.iter().any(|c| c == "password_hint") {
            self.conn.execute("ALTER TABLE master ADD COLUMN password_hint TEXT", [])?;
        }

        // Check entries table columns
        let entries_columns: Vec<String> = self.conn
            .prepare("PRAGMA table_info(entries)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;

        if !entries_columns.iter().any(|c| c == "comment") {
            self.conn.execute("ALTER TABLE entries ADD COLUMN comment TEXT", [])?;
        }
        if !entries_columns.iter().any(|c| c == "group") {
            self.conn.execute("ALTER TABLE entries ADD COLUMN `group` TEXT DEFAULT '默认分组'", [])?;
        }
        if !entries_columns.iter().any(|c| c == "position") {
            self.conn.execute("ALTER TABLE entries ADD COLUMN position INTEGER DEFAULT 0", [])?;
            // Seed positions for existing rows using their id (preserves insertion order)
            self.conn.execute("UPDATE entries SET position = id WHERE position = 0", [])?;
        }

        Ok(())
    }

    /// Check if vault has been initialized (master record exists)
    pub fn is_initialized(&self) -> Result<bool, DatabaseError> {
        let count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM master",
            [],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Create master record for new vault
    pub fn create_master(
        &self,
        crypto: &VaultCrypto,
        test_encrypted: &EncryptedData,
        password_hint: &str,
    ) -> Result<(), DatabaseError> {
        self.conn.execute(
            "INSERT INTO master (salt, iterations, test_password_encrypted, test_nonce, test_tag, password_hint)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                crypto.salt(),
                100_000u32,
                &test_encrypted.ciphertext,
                &test_encrypted.nonce[..],
                &test_encrypted.tag[..],
                password_hint,
            ],
        )?;
        Ok(())
    }

    /// Get master record for vault unlocking
    pub fn get_master_record(&self) -> Result<Option<MasterRecord>, DatabaseError> {
        let result = self.conn.query_row(
            "SELECT salt, iterations, test_password_encrypted, test_nonce, test_tag, password_hint
             FROM master WHERE id = 1",
            [],
            |row| {
                let salt_blob: Vec<u8> = row.get(0)?;
                let iterations: u32 = row.get(1)?;
                let test_ciphertext: Vec<u8> = row.get(2)?;
                let test_nonce_blob: Vec<u8> = row.get(3)?;
                let test_tag_blob: Vec<u8> = row.get(4)?;
                let password_hint: Option<String> = row.get(5)?;

                // Convert blobs to fixed-size arrays
                if salt_blob.len() != SALT_SIZE || test_nonce_blob.len() != NONCE_SIZE || test_tag_blob.len() != TAG_SIZE {
                    return Err(rusqlite::Error::InvalidParameterName("Invalid blob size".to_string()));
                }

                let mut salt = [0u8; SALT_SIZE];
                salt.copy_from_slice(&salt_blob);
                let mut test_nonce = [0u8; NONCE_SIZE];
                test_nonce.copy_from_slice(&test_nonce_blob);
                let mut test_tag = [0u8; TAG_SIZE];
                test_tag.copy_from_slice(&test_tag_blob);

                Ok(MasterRecord {
                    salt,
                    iterations,
                    test_ciphertext,
                    test_nonce,
                    test_tag,
                    password_hint: password_hint.unwrap_or_default(),
                })
            },
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DatabaseError::Sqlite(e)),
        }
    }

    /// Get password hint
    pub fn get_password_hint(&self) -> Result<String, DatabaseError> {
        let hint: Option<String> = self.conn.query_row(
            "SELECT password_hint FROM master WHERE id = 1",
            [],
            |row| row.get(0),
        ).ok().flatten();

        Ok(hint.unwrap_or_default())
    }

    // ==================== Entry Operations ====================

    /// Add a new password entry
    pub fn add_entry(
        &self,
        crypto: &VaultCrypto,
        website: &str,
        username: &str,
        password: &str,
        comment: &str,
        group: &str,
    ) -> Result<i32, DatabaseError> {
        let encrypted = crypto.encrypt(password.as_bytes())?;

        // New entries go to the bottom: position = max(position) + 1
        self.conn.execute(
            "INSERT INTO entries (website, username, password_encrypted, nonce, tag, comment, `group`, position)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE((SELECT MAX(position) FROM entries), 0) + 1)",
            params![
                website,
                username,
                &encrypted.ciphertext,
                &encrypted.nonce[..],
                &encrypted.tag[..],
                comment,
                group,
            ],
        )?;

        Ok(self.conn.last_insert_rowid() as i32)
    }

    /// Replace master record with a new key and re-encrypt all entries in a single transaction.
    ///
    /// `entries` should contain plaintext passwords (already decrypted with the old key).
    /// On success, the master record is updated to the new salt/test ciphertext and every
    /// entry's password column is re-encrypted with `new_crypto`. Failure rolls back.
    pub fn replace_master_and_reencrypt(
        &self,
        new_crypto: &VaultCrypto,
        new_test_encrypted: &EncryptedData,
        password_hint: &str,
        entries: &[Entry],
    ) -> Result<(), DatabaseError> {
        let tx = self.conn.unchecked_transaction()?;

        tx.execute(
            "UPDATE master SET salt = ?1, iterations = ?2, test_password_encrypted = ?3,
             test_nonce = ?4, test_tag = ?5, password_hint = ?6 WHERE id = 1",
            params![
                new_crypto.salt(),
                ITERATIONS,
                &new_test_encrypted.ciphertext,
                &new_test_encrypted.nonce[..],
                &new_test_encrypted.tag[..],
                password_hint,
            ],
        )?;

        for entry in entries {
            let new_enc = new_crypto.encrypt(entry.password.as_bytes())?;
            tx.execute(
                "UPDATE entries SET password_encrypted = ?1, nonce = ?2, tag = ?3 WHERE id = ?4",
                params![
                    &new_enc.ciphertext,
                    &new_enc.nonce[..],
                    &new_enc.tag[..],
                    entry.id,
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// Move multiple entries to a target group in a single transaction.
    /// Also ensures the target group row exists in the groups table.
    pub fn move_entries_to_group(&self, ids: &[i32], group: &str) -> Result<usize, DatabaseError> {
        if ids.is_empty() {
            return Ok(0);
        }
        // Make sure the group exists so the sidebar can show it
        let _ = self.add_group(group);

        let tx = self.conn.unchecked_transaction()?;
        let mut updated = 0;
        for &id in ids {
            let n = tx.execute(
                "UPDATE entries SET `group` = ?1 WHERE id = ?2",
                params![group, id],
            )?;
            updated += n;
        }
        tx.commit()?;
        Ok(updated)
    }

    /// Reorder entries by reassigning positions.
    ///
    /// `ids` is the new order for a subset of entries. Their existing position values
    /// are collected, sorted ascending, then handed out in the order of `ids`. This
    /// keeps positions of unaffected entries untouched.
    pub fn reorder_entries(&self, ids: &[i32]) -> Result<(), DatabaseError> {
        if ids.is_empty() {
            return Ok(());
        }

        let tx = self.conn.unchecked_transaction()?;

        let mut current: Vec<i64> = Vec::with_capacity(ids.len());
        for &id in ids {
            let pos: i64 = tx.query_row(
                "SELECT position FROM entries WHERE id = ?1",
                [id],
                |row| row.get(0),
            )?;
            current.push(pos);
        }
        current.sort();

        for (i, &id) in ids.iter().enumerate() {
            tx.execute(
                "UPDATE entries SET position = ?1 WHERE id = ?2",
                params![current[i], id],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// Get all entries (optionally filtered by group), decrypted
    pub fn get_entries(&self, crypto: &VaultCrypto, group: Option<&str>) -> Result<Vec<Entry>, DatabaseError> {
        let records: Vec<EntryRecord> = if group.is_some() && group != Some("全部") {
            self.conn
                .prepare(
                    "SELECT id, website, username, password_encrypted, nonce, tag, comment, `group`
                     FROM entries WHERE `group` = ?1
                     ORDER BY position ASC, id ASC"
                )?
                .query_map([group.unwrap()], |row| self.row_to_entry_record(row))?
                .collect::<Result<Vec<_>, _>>()?
        } else {
            self.conn
                .prepare(
                    "SELECT id, website, username, password_encrypted, nonce, tag, comment, `group`
                     FROM entries
                     ORDER BY position ASC, id ASC"
                )?
                .query_map([], |row| self.row_to_entry_record(row))?
                .collect::<Result<Vec<_>, _>>()?
        };

        let entries: Vec<Entry> = records
            .into_iter()
            .map(|record| self.decrypt_entry(crypto, record))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(entries)
    }

    /// Convert row to EntryRecord
    fn row_to_entry_record(&self, row: &Row) -> Result<EntryRecord, rusqlite::Error> {
        Ok(EntryRecord {
            id: row.get(0)?,
            website: row.get(1)?,
            username: row.get(2)?,
            password_encrypted: row.get(3)?,
            nonce: row.get(4)?,
            tag: row.get(5)?,
            comment: row.get(6)?,
            group: row.get(7)?,
        })
    }

    /// Decrypt entry record to Entry
    fn decrypt_entry(&self, crypto: &VaultCrypto, record: EntryRecord) -> Result<Entry, DatabaseError> {
        let password = crypto.decrypt(&record.password_encrypted, &record.nonce, &record.tag)?;
        let password_str = String::from_utf8(password)
            .map_err(|e| DatabaseError::Encoding(e.to_string()))?;

        Ok(Entry {
            id: record.id,
            website: record.website,
            username: record.username,
            password: password_str,
            comment: record.comment.unwrap_or_default(),
            group: record.group,
        })
    }

    /// Update an existing entry
    pub fn update_entry(
        &self,
        crypto: &VaultCrypto,
        id: i32,
        website: &str,
        username: &str,
        password: &str,
        comment: &str,
        group: &str,
    ) -> Result<(), DatabaseError> {
        let encrypted = crypto.encrypt(password.as_bytes())?;

        self.conn.execute(
            "UPDATE entries SET website = ?1, username = ?2, password_encrypted = ?3,
             nonce = ?4, tag = ?5, comment = ?6, `group` = ?7 WHERE id = ?8",
            params![
                website,
                username,
                &encrypted.ciphertext,
                &encrypted.nonce[..],
                &encrypted.tag[..],
                comment,
                group,
                id,
            ],
        )?;

        Ok(())
    }

    /// Delete an entry
    pub fn delete_entry(&self, id: i32) -> Result<(), DatabaseError> {
        self.conn.execute("DELETE FROM entries WHERE id = ?1", [id])?;
        Ok(())
    }

    // ==================== Group Operations ====================

    /// Get all groups with entry counts
    pub fn get_groups(&self) -> Result<Vec<Group>, DatabaseError> {
        let groups: Vec<Group> = self.conn
            .prepare(
                "SELECT name FROM groups ORDER BY name"
            )?
            .query_map([], |row| {
                let name: String = row.get(0)?;
                Ok(name)
            })?
            .collect::<Result<Vec<String>, _>>()?
            .into_iter()
            .map(|name| {
                let count: i32 = self.conn.query_row(
                    "SELECT COUNT(*) FROM entries WHERE `group` = ?1",
                    [&name],
                    |row| row.get(0),
                ).unwrap_or(0);
                Group { name, count }
            })
            .collect();

        // Move '默认分组' to front
        let mut sorted_groups = groups;
        if let Some(pos) = sorted_groups.iter().position(|g| g.name == "默认分组") {
            let default_group = sorted_groups.remove(pos);
            sorted_groups.insert(0, default_group);
        }

        Ok(sorted_groups)
    }

    /// Add a new group
    pub fn add_group(&self, name: &str) -> Result<bool, DatabaseError> {
        let result = self.conn.execute(
            "INSERT OR IGNORE INTO groups (name) VALUES (?1)",
            [name],
        )?;
        Ok(result > 0)
    }

    /// Delete a group (entries moved to default group)
    pub fn delete_group(&self, name: &str) -> Result<(), DatabaseError> {
        // Move entries to default group
        self.conn.execute(
            "UPDATE entries SET `group` = '默认分组' WHERE `group` = ?1",
            [name],
        )?;

        // Delete the group
        self.conn.execute("DELETE FROM groups WHERE name = ?1", [name])?;

        Ok(())
    }

    // ==================== Import/Export ====================

    /// Internal: write a list of decrypted entries to a CSV file.
    fn write_entries_csv(&self, path: &Path, entries: &[Entry]) -> Result<(), DatabaseError> {
        let mut wtr = csv::Writer::from_path(path)?;
        wtr.write_record(["标题", "用户名", "密码", "备注", "分组"])?;
        for entry in entries {
            wtr.write_record([
                &entry.website,
                &entry.username,
                &entry.password,
                &entry.comment,
                &entry.group,
            ])?;
        }
        wtr.flush()?;
        Ok(())
    }

    /// Export every entry to a CSV file.
    pub fn export_csv(&self, crypto: &VaultCrypto, path: &Path) -> Result<(), DatabaseError> {
        let entries = self.get_entries(crypto, None)?;
        self.write_entries_csv(path, &entries)
    }

    /// Export only the entries whose ids appear in `ids`.
    pub fn export_csv_selected(&self, crypto: &VaultCrypto, path: &Path, ids: &[i32]) -> Result<(), DatabaseError> {
        if ids.is_empty() {
            return self.write_entries_csv(path, &[]);
        }
        let id_set: std::collections::HashSet<i32> = ids.iter().copied().collect();
        let all_entries = self.get_entries(crypto, None)?;
        let filtered: Vec<Entry> = all_entries.into_iter().filter(|e| id_set.contains(&e.id)).collect();
        self.write_entries_csv(path, &filtered)
    }

    /// Import entries from CSV file.
    ///
    /// Picks the first encoding that decodes the bytes WITHOUT replacement
    /// characters. Decoding UTF-8 over GBK-encoded Chinese "succeeds" for the
    /// ASCII structure but mangles multi-byte runs into U+FFFD — checking
    /// `had_errors` lets us reject that case and fall through to GBK/GB18030.
    pub fn import_csv(&self, crypto: &VaultCrypto, path: &Path) -> Result<usize, DatabaseError> {
        let content = fs::read(path)?;

        let encodings = [
            encoding_rs::UTF_8,
            encoding_rs::GBK,
            encoding_rs::GB18030,
            encoding_rs::WINDOWS_1252,
        ];

        // First pass: only accept lossless decodes.
        let mut decoded_text: Option<std::borrow::Cow<'_, str>> = None;
        for enc in &encodings {
            let (text, _, had_errors) = enc.decode(&content);
            if !had_errors {
                decoded_text = Some(text);
                break;
            }
        }
        // Last-resort fallback: lossy UTF-8 (better some output than none).
        let decoded = decoded_text.unwrap_or_else(|| {
            let (text, _, _) = encoding_rs::UTF_8.decode(&content);
            text
        });

        let mut reader = csv::ReaderBuilder::new()
            .has_headers(true)
            .from_reader(decoded.as_bytes());

        let mut count = 0;
        for result in reader.records() {
            match result {
                Ok(record) => {
                    if record.len() >= 3 {
                        let website = record[0].trim();
                        let username = record[1].trim();
                        let password = &record[2];
                        let comment = if record.len() > 3 { record[3].trim() } else { "" };
                        let raw_group = if record.len() > 4 { record[4].trim() } else { "" };
                        let group = if raw_group.is_empty() { "默认分组" } else { raw_group };

                        // Make sure the group row exists so the sidebar can show it.
                        let _ = self.add_group(group);

                        if self.add_entry(crypto, website, username, password, comment, group).is_err() {
                            continue;
                        }
                        count += 1;
                    }
                }
                Err(_) => continue,
            }
        }

        Ok(count)
    }
}