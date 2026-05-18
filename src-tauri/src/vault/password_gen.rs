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

/// Clamp bounds for the requested length. The UI slider is 8..=64, but the
/// command is reachable directly via `invoke()`, so the generator must defend
/// itself: a non-positive length must never yield an empty password, and an
/// absurd length must not be turned into a multi-GB allocation.
pub const MIN_LENGTH: i32 = 8;
pub const MAX_LENGTH: i32 = 4096;

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

    let length = options.length.clamp(MIN_LENGTH, MAX_LENGTH);

    (0..length)
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

    #[test]
    fn test_non_positive_length_falls_back_to_minimum() {
        // A password manager must never hand back an empty string just because
        // the requested length was zero or negative.
        for bad_len in [-100, -1, 0] {
            let options = PasswordOptions {
                length: bad_len,
                ..PasswordOptions::default()
            };
            let password = generate_password(&options);
            assert_eq!(
                password.chars().count(),
                MIN_LENGTH as usize,
                "length {bad_len} should clamp to MIN_LENGTH"
            );
        }
    }

    #[test]
    fn test_excessive_length_is_capped() {
        let options = PasswordOptions {
            length: i32::MAX,
            ..PasswordOptions::default()
        };
        let password = generate_password(&options);
        assert_eq!(password.chars().count(), MAX_LENGTH as usize);
    }
}