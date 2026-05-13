//! Vault state management
//!
//! Manages the unlocked/locked state and stores the crypto instance.

use std::path::PathBuf;

use crate::vault::{VaultCrypto, Database};

/// Vault state containing database connection and optional crypto (when unlocked)
pub struct VaultState {
    /// Database connection (always available)
    db: Database,
    /// Crypto instance (only when vault is unlocked)
    crypto: Option<VaultCrypto>,
    /// Database path (stored for potential future use)
    #[allow(dead_code)]
    db_path: PathBuf,
}

impl VaultState {
    /// Create new vault state with database connection
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        let db = Database::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        Ok(Self {
            db,
            crypto: None,
            db_path,
        })
    }

    /// Check if vault is unlocked
    pub fn is_unlocked(&self) -> bool {
        self.crypto.is_some()
    }

    /// Check if vault has been initialized
    pub fn is_initialized(&self) -> Result<bool, String> {
        self.db.is_initialized().map_err(|e| e.to_string())
    }

    /// Initialize a new vault with master password
    pub fn setup(&mut self, password: &str, hint: &str) -> Result<bool, String> {
        if self.is_initialized()? {
            return Err("Vault already initialized".to_string());
        }

        let (crypto, test_encrypted) = VaultCrypto::create_new(password)
            .map_err(|e| e.to_string())?;

        self.db.create_master(&crypto, &test_encrypted, hint)
            .map_err(|e| e.to_string())?;

        self.crypto = Some(crypto);
        Ok(true)
    }

    /// Unlock vault with master password
    pub fn unlock(&mut self, password: &str) -> Result<bool, String> {
        let master = self.db.get_master_record()
            .map_err(|e| e.to_string())?
            .ok_or("Vault not initialized")?;

        let crypto = VaultCrypto::from_master(password, &master)
            .map_err(|_| "Invalid password".to_string())?;

        self.crypto = Some(crypto);
        Ok(true)
    }

    /// Change master password: verify old, re-derive new key, re-encrypt all entries.
    /// Vault stays unlocked under the new key on success.
    pub fn change_master_password(
        &mut self,
        old_password: &str,
        new_password: &str,
        new_hint: &str,
    ) -> Result<(), String> {
        let master = self.db.get_master_record()
            .map_err(|e| e.to_string())?
            .ok_or("Vault not initialized")?;

        // Verify old password by trying to derive crypto from master
        let old_crypto = VaultCrypto::from_master(old_password, &master)
            .map_err(|_| "原主密码错误".to_string())?;

        // Decrypt all entries (full list, no group filter) with the old key
        let entries = self.db.get_entries(&old_crypto, None)
            .map_err(|e| e.to_string())?;

        // Create new crypto + new test ciphertext from the new password
        let (new_crypto, new_test_encrypted) = VaultCrypto::create_new(new_password)
            .map_err(|e| e.to_string())?;

        // Atomically replace master + re-encrypt every entry
        self.db.replace_master_and_reencrypt(&new_crypto, &new_test_encrypted, new_hint, &entries)
            .map_err(|e| e.to_string())?;

        // Swap crypto so vault stays unlocked under the new key
        if let Some(ref mut prev) = self.crypto {
            prev.clear_key();
        }
        self.crypto = Some(new_crypto);

        Ok(())
    }

    /// Lock vault (clear crypto instance)
    pub fn lock(&mut self) {
        // Clear key memory securely
        if let Some(ref mut crypto) = self.crypto {
            crypto.clear_key();
        }
        self.crypto = None;
    }

    /// Get password hint
    pub fn get_password_hint(&self) -> Result<String, String> {
        self.db.get_password_hint().map_err(|e| e.to_string())
    }

    /// Get crypto reference (returns error if locked)
    pub fn crypto(&self) -> Result<&VaultCrypto, String> {
        self.crypto.as_ref().ok_or("Vault is locked".to_string())
    }

    /// Get database reference
    pub fn db(&self) -> &Database {
        &self.db
    }
}