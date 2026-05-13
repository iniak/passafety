//! Password generator
//!
//! Generates random passwords with configurable options.

use rand::seq::SliceRandom;
use rand::thread_rng;
use serde::{Deserialize, Serialize};

/// Password generation options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordOptions {
    pub length: i32,
    pub uppercase: bool,
    pub lowercase: bool,
    pub numbers: bool,
    pub symbols: bool,
}

impl Default for PasswordOptions {
    fn default() -> Self {
        Self {
            length: 16,
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: true,
        }
    }
}

/// Character sets for password generation
const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
const NUMBERS: &[u8] = b"0123456789";
const SYMBOLS: &[u8] = b"!@#$%^&*()_+-=[]{}|;:,.<>?";

/// Generate a random password with specified options
pub fn generate_password(options: &PasswordOptions) -> String {
    let mut characters: Vec<u8> = Vec::new();

    if options.uppercase {
        characters.extend_from_slice(UPPERCASE);
    }
    if options.lowercase {
        characters.extend_from_slice(LOWERCASE);
    }
    if options.numbers {
        characters.extend_from_slice(NUMBERS);
    }
    if options.symbols {
        characters.extend_from_slice(SYMBOLS);
    }

    // Default to letters + numbers if no options selected
    if characters.is_empty() {
        characters.extend_from_slice(UPPERCASE);
        characters.extend_from_slice(LOWERCASE);
        characters.extend_from_slice(NUMBERS);
    }

    let mut rng = thread_rng();

    (0..options.length)
        .map(|_| {
            let idx = characters.choose(&mut rng).unwrap();
            *idx as char
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_password_length() {
        let password = generate_password(&PasswordOptions::default());
        assert_eq!(password.len(), 16);
    }

    #[test]
    fn test_custom_length() {
        let options = PasswordOptions {
            length: 32,
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: false,
        };
        let password = generate_password(&options);
        assert_eq!(password.len(), 32);
    }

    #[test]
    fn test_uppercase_only() {
        let options = PasswordOptions {
            length: 10,
            uppercase: true,
            lowercase: false,
            numbers: false,
            symbols: false,
        };
        let password = generate_password(&options);
        assert!(password.chars().all(|c| c.is_ascii_uppercase()));
    }

    #[test]
    fn test_numbers_only() {
        let options = PasswordOptions {
            length: 8,
            uppercase: false,
            lowercase: false,
            numbers: true,
            symbols: false,
        };
        let password = generate_password(&options);
        assert!(password.chars().all(|c| c.is_ascii_digit()));
    }
}