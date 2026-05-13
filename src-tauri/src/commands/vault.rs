//! Tauri command handlers for vault operations
//!
//! Direct vault module calls (no JSON-RPC layer).

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

use crate::vault::{VaultState, Entry, Group, PasswordOptions};
use crate::vault::password_gen::generate_password as gen_password;

// ==================== Response Types ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultEntry {
    pub id: i32,
    pub website: String,
    pub username: String,
    pub password: String,
    pub comment: String,
    pub group: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GroupResponse {
    pub name: String,
    pub count: i32,
}

impl From<Entry> for VaultEntry {
    fn from(entry: Entry) -> Self {
        Self {
            id: entry.id,
            website: entry.website,
            username: entry.username,
            password: entry.password,
            comment: entry.comment,
            group: entry.group,
        }
    }
}

impl From<Group> for GroupResponse {
    fn from(group: Group) -> Self {
        Self {
            name: group.name,
            count: group.count,
        }
    }
}

// ==================== Vault Commands ====================

/// Unlock vault with master password
#[tauri::command]
pub async fn unlock_vault(
    password: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<bool, String> {
    let mut vault = state.lock().map_err(|e| e.to_string())?;
    vault.unlock(&password)
}

/// Setup new vault with master password
#[tauri::command]
pub async fn setup_vault(
    password: String,
    hint: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<bool, String> {
    let mut vault = state.lock().map_err(|e| e.to_string())?;
    vault.setup(&password, &hint)
}

/// Lock vault
#[tauri::command]
pub async fn lock_vault(state: State<'_, Mutex<VaultState>>) -> Result<(), String> {
    let mut vault = state.lock().map_err(|e| e.to_string())?;
    vault.lock();
    Ok(())
}

/// Get password hint
#[tauri::command]
pub async fn get_password_hint(
    state: State<'_, Mutex<VaultState>>,
) -> Result<String, String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    vault.get_password_hint()
}

/// Change master password (re-derive key, re-encrypt all entries)
#[tauri::command]
pub async fn change_master_password(
    old_password: String,
    new_password: String,
    new_hint: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let mut vault = state.lock().map_err(|e| e.to_string())?;
    vault.change_master_password(&old_password, &new_password, &new_hint)
}

/// Check if vault is initialized
#[tauri::command]
pub async fn is_vault_initialized(
    state: State<'_, Mutex<VaultState>>,
) -> Result<bool, String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    vault.is_initialized()
}

// ==================== Entry Commands ====================

/// Get all entries (optionally filtered by group)
#[tauri::command]
pub async fn get_entries(
    group: Option<String>,
    state: State<'_, Mutex<VaultState>>,
) -> Result<Vec<VaultEntry>, String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    let crypto = vault.crypto()?;
    let entries = vault.db().get_entries(crypto, group.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(entries.into_iter().map(VaultEntry::from).collect())
}

/// Add new password entry
#[tauri::command]
pub async fn add_entry(
    website: String,
    username: String,
    password: String,
    comment: String,
    group: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    let crypto = vault.crypto()?;
    vault.db().add_entry(crypto, &website, &username, &password, &comment, &group)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Update existing password entry
#[tauri::command]
pub async fn update_entry(
    id: i32,
    website: String,
    username: String,
    password: String,
    comment: String,
    group: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    let crypto = vault.crypto()?;
    vault.db().update_entry(crypto, id, &website, &username, &password, &comment, &group)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete password entry
#[tauri::command]
pub async fn delete_entry(
    id: i32,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    vault.db().delete_entry(id).map_err(|e| e.to_string())?;
    Ok(())
}

/// Reorder entries by reassigning their positions in the order provided
#[tauri::command]
pub async fn reorder_entries(
    ordered_ids: Vec<i32>,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    vault.db().reorder_entries(&ordered_ids).map_err(|e| e.to_string())?;
    Ok(())
}

/// Move multiple entries to a target group (transactional)
#[tauri::command]
pub async fn move_entries_to_group(
    ids: Vec<i32>,
    group: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<usize, String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    vault.db().move_entries_to_group(&ids, &group).map_err(|e| e.to_string())
}

// ==================== Group Commands ====================

/// Get all groups with entry counts
#[tauri::command]
pub async fn get_groups(
    state: State<'_, Mutex<VaultState>>,
) -> Result<Vec<GroupResponse>, String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    let groups = vault.db().get_groups().map_err(|e| e.to_string())?;
    Ok(groups.into_iter().map(GroupResponse::from).collect())
}

/// Add new group
#[tauri::command]
pub async fn add_group(
    name: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<bool, String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    vault.db().add_group(&name).map_err(|e| e.to_string())
}

/// Delete group (entries moved to default group)
#[tauri::command]
pub async fn delete_group(
    name: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    vault.db().delete_group(&name).map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== Import/Export Commands ====================

/// Export entries to CSV file
#[tauri::command]
pub async fn export_csv(
    path: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    let crypto = vault.crypto()?;
    let path = std::path::Path::new(&path);
    vault.db().export_csv(crypto, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Export only the entries with the given ids to a CSV file.
#[tauri::command]
pub async fn export_csv_selected(
    path: String,
    ids: Vec<i32>,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    let crypto = vault.crypto()?;
    let path = std::path::Path::new(&path);
    vault.db().export_csv_selected(crypto, path, &ids).map_err(|e| e.to_string())?;
    Ok(())
}

/// Import entries from CSV file
#[tauri::command]
pub async fn import_csv(
    path: String,
    state: State<'_, Mutex<VaultState>>,
) -> Result<(), String> {
    let vault = state.lock().map_err(|e| e.to_string())?;
    let crypto = vault.crypto()?;
    let path = std::path::Path::new(&path);
    vault.db().import_csv(crypto, path).map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== Password Generator ====================

/// Generate random password
#[tauri::command]
pub async fn generate_password_cmd(
    options: PasswordOptions,
    _state: State<'_, Mutex<VaultState>>,
) -> Result<String, String> {
    Ok(gen_password(&options))
}