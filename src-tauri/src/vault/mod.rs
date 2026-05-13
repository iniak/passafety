//! Vault module - Core password management functionality
//!
//! This module provides encryption, database operations, and state management
//! for the PasSafety password manager, replacing the Python backend.

pub mod crypto;
pub mod db;
pub mod state;
pub mod password_gen;

pub use crypto::{VaultCrypto, CryptoError, EncryptedData, MasterRecord};
pub use db::{Database, DatabaseError, Entry, Group};
pub use state::VaultState;
pub use password_gen::{generate_password, PasswordOptions};