//! Cryptographic operations for vault encryption
//!
//! Implements PBKDF2 key derivation and AES-256-GCM encryption,
//! compatible with the Python cryptography library.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use zeroize::Zeroize;
use thiserror::Error;

/// Cryptographic constants matching Python implementation
pub const SALT_SIZE: usize = 16;
pub const NONCE_SIZE: usize = 12;
pub const KEY_SIZE: usize = 32;
pub const TAG_SIZE: usize = 16;
pub const ITERATIONS: u32 = 100_000;

/// Test password used to verify master password correctness
const TEST_PASSWORD: &[u8] = b"test_password";

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Key not set")]
    KeyNotSet,
    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),
    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),
    #[error("Invalid salt size")]
    InvalidSaltSize,
    #[error("Invalid nonce size")]
    InvalidNonceSize,
    #[error("Invalid tag size")]
    InvalidTagSize,
}

/// Encrypted data components, stored separately in database
#[derive(Debug, Clone)]
pub struct EncryptedData {
    pub ciphertext: Vec<u8>,
    pub nonce: [u8; NONCE_SIZE],
    pub tag: [u8; TAG_SIZE],
}

/// Master record containing vault initialization data
#[derive(Debug, Clone)]
pub struct MasterRecord {
    pub salt: [u8; SALT_SIZE],
    pub iterations: u32,
    pub test_ciphertext: Vec<u8>,
    pub test_nonce: [u8; NONCE_SIZE],
    pub test_tag: [u8; TAG_SIZE],
    pub password_hint: String,
}

/// Vault cryptography handler with secure key storage
///
/// Key is securely cleared from memory when clear_key() is called
/// or when the struct is dropped.
pub struct VaultCrypto {
    key: [u8; KEY_SIZE],
    salt: [u8; SALT_SIZE],
}

impl Drop for VaultCrypto {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}

impl VaultCrypto {
    /// Derive encryption key from password using PBKDF2-HMAC-SHA256
    ///
    /// Parameters match Python implementation:
    /// - Algorithm: HMAC-SHA256
    /// - Iterations: 100,000
    /// - Key length: 32 bytes (AES-256)
    /// - Salt length: 16 bytes
    pub fn derive_key(password: &str, salt: &[u8], iterations: u32) -> Result<[u8; KEY_SIZE], CryptoError> {
        if salt.len() != SALT_SIZE {
            return Err(CryptoError::InvalidSaltSize);
        }

        let mut salt_arr = [0u8; SALT_SIZE];
        salt_arr.copy_from_slice(salt);

        let mut key = [0u8; KEY_SIZE];
        pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt_arr, iterations, &mut key);
        Ok(key)
    }

    /// Create new crypto instance for a new vault
    ///
    /// Generates random salt and creates test password for verification
    pub fn create_new(password: &str) -> Result<(Self, EncryptedData), CryptoError> {
        let mut salt = [0u8; SALT_SIZE];
        rand::thread_rng().fill_bytes(&mut salt);

        let key = Self::derive_key(password, &salt, ITERATIONS)?;

        let crypto = Self { key, salt };
        let test_encrypted = crypto.encrypt(TEST_PASSWORD)?;

        Ok((crypto, test_encrypted))
    }

    /// Create crypto instance from existing master record
    ///
    /// Used when unlocking an existing vault
    pub fn from_master(password: &str, master: &MasterRecord) -> Result<Self, CryptoError> {
        let key = Self::derive_key(password, &master.salt, master.iterations)?;

        // Verify password by attempting to decrypt test password
        let crypto = Self { key, salt: master.salt };
        crypto.decrypt(&master.test_ciphertext, &master.test_nonce, &master.test_tag)?;

        Ok(crypto)
    }

    /// Encrypt plaintext data
    ///
    /// Returns ciphertext, nonce, and tag as separate components
    /// (matching Python storage format)
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<EncryptedData, CryptoError> {
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

        // Generate random 12-byte nonce (GCM recommended size)
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Encrypt - aes_gcm appends tag to ciphertext
        let ciphertext_with_tag = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

        // Separate ciphertext and tag (Python stores them separately)
        if ciphertext_with_tag.len() < TAG_SIZE {
            return Err(CryptoError::EncryptionFailed("Ciphertext too short".into()));
        }

        let (ciphertext, tag_slice) = ciphertext_with_tag.split_at(ciphertext_with_tag.len() - TAG_SIZE);

        let mut tag = [0u8; TAG_SIZE];
        tag.copy_from_slice(tag_slice);

        Ok(EncryptedData {
            ciphertext: ciphertext.to_vec(),
            nonce: nonce_bytes,
            tag,
        })
    }

    /// Decrypt encrypted data
    ///
    /// Takes ciphertext, nonce, and tag as separate components
    pub fn decrypt(&self, ciphertext: &[u8], nonce: &[u8], tag: &[u8]) -> Result<Vec<u8>, CryptoError> {
        if nonce.len() != NONCE_SIZE {
            return Err(CryptoError::InvalidNonceSize);
        }
        if tag.len() != TAG_SIZE {
            return Err(CryptoError::InvalidTagSize);
        }

        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|e| CryptoError::DecryptionFailed(e.to_string()))?;

        let nonce_arr: [u8; NONCE_SIZE] = nonce.try_into()
            .map_err(|_| CryptoError::InvalidNonceSize)?;
        let nonce = Nonce::from_slice(&nonce_arr);

        // Reconstruct ciphertext with tag appended (aes_gcm format)
        let mut ciphertext_with_tag = ciphertext.to_vec();
        ciphertext_with_tag.extend_from_slice(tag);

        cipher
            .decrypt(nonce, ciphertext_with_tag.as_slice())
            .map_err(|e| CryptoError::DecryptionFailed(e.to_string()))
    }

    /// Get the salt used for key derivation
    pub fn salt(&self) -> &[u8] {
        &self.salt
    }

    /// Verify if this crypto instance can decrypt the test password
    pub fn verify(&self, test_ciphertext: &[u8], test_nonce: &[u8], test_tag: &[u8]) -> bool {
        self.decrypt(test_ciphertext, test_nonce, test_tag)
            .map(|decrypted| decrypted == TEST_PASSWORD)
            .unwrap_or(false)
    }

    /// Clear the encryption key from memory (for locking)
    pub fn clear_key(&mut self) {
        self.key.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_derivation_consistency() {
        let password = "test_password_123";
        let salt = [1u8; SALT_SIZE];

        let key1 = VaultCrypto::derive_key(password, &salt, ITERATIONS).unwrap();
        let key2 = VaultCrypto::derive_key(password, &salt, ITERATIONS).unwrap();

        assert_eq!(key1, key2);
    }

    #[test]
    fn test_encryption_decryption() {
        let (crypto, _) = VaultCrypto::create_new("master_password").unwrap();

        let plaintext = b"secret_data";
        let encrypted = crypto.encrypt(plaintext).unwrap();

        let decrypted = crypto.decrypt(&encrypted.ciphertext, &encrypted.nonce, &encrypted.tag).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_wrong_password_fails() {
        let (crypto, test_enc) = VaultCrypto::create_new("correct_password").unwrap();

        // Try to decrypt with wrong password
        let wrong_salt = crypto.salt();
        let mut salt_copy = [0u8; SALT_SIZE];
        salt_copy.copy_from_slice(wrong_salt);
        let master = MasterRecord {
            salt: salt_copy,
            iterations: ITERATIONS,
            test_ciphertext: test_enc.ciphertext,
            test_nonce: test_enc.nonce,
            test_tag: test_enc.tag,
            password_hint: String::new(),
        };

        let result = VaultCrypto::from_master("wrong_password", &master);
        assert!(result.is_err());
    }
}