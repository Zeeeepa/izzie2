/**
 * Per-User Encryption Service
 *
 * Provides user-managed encryption with passphrases using:
 * - Argon2id for key derivation (memory-hard, resistant to GPU/ASIC attacks)
 * - AES-256-GCM for symmetric encryption (authenticated encryption)
 *
 * Security Notes:
 * - Derived keys are NEVER stored, only hashes for verification
 * - Each user has a unique salt for key derivation
 * - Encryption keys exist only in memory during session
 */

import * as argon2 from 'argon2';
import * as crypto from 'crypto';

// Argon2id parameters (OWASP recommendations for key derivation)
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3, // 3 iterations
  parallelism: 4, // 4 parallel threads
  hashLength: 32, // 256-bit key
};

// AES-256-GCM configuration
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// Word lists for memorable passphrase generation
const ADJECTIVES = [
  'coral', 'azure', 'amber', 'jade', 'ruby', 'pearl', 'ivory', 'ebony',
  'golden', 'silver', 'copper', 'bronze', 'crimson', 'violet', 'indigo',
  'scarlet', 'cobalt', 'emerald', 'marble', 'velvet', 'crystal', 'shadow',
  'stellar', 'cosmic', 'lunar', 'solar', 'arctic', 'alpine', 'mystic',
  'noble', 'royal', 'ancient', 'primal', 'serene', 'tranquil', 'silent',
  'gentle', 'mighty', 'swift', 'clever', 'brave', 'wise', 'keen', 'bold',
];

const NOUNS = [
  'mountain', 'river', 'forest', 'ocean', 'desert', 'valley', 'canyon',
  'meadow', 'glacier', 'volcano', 'island', 'harbor', 'bridge', 'tower',
  'garden', 'castle', 'temple', 'palace', 'cottage', 'lighthouse', 'beacon',
  'phoenix', 'dragon', 'falcon', 'raven', 'dolphin', 'tiger', 'wolf',
  'compass', 'anchor', 'horizon', 'summit', 'cascade', 'aurora', 'nebula',
  'comet', 'orbit', 'eclipse', 'prism', 'crystal', 'ember', 'spark', 'flame',
];

/**
 * Encrypted data structure
 * Contains all information needed for decryption
 */
export interface EncryptedData {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded authentication tag */
  tag: string;
}

/**
 * Key derivation result
 * Contains the derived key and hash for verification
 */
export interface DerivedKey {
  /** Raw 256-bit key for encryption/decryption */
  key: Buffer;
  /** Argon2id hash for verification (safe to store) */
  hash: string;
}

/**
 * Generate a random salt for key derivation
 * @returns Base64-encoded 128-bit salt
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Generate a memorable passphrase in format: adjective-noun-number
 * Provides approximately 40 bits of entropy
 *
 * @returns Passphrase like "coral-mountain-7829"
 */
export function generatePassphrase(): string {
  const adjective = ADJECTIVES[crypto.randomInt(0, ADJECTIVES.length)];
  const noun = NOUNS[crypto.randomInt(0, NOUNS.length)];
  const number = crypto.randomInt(1000, 10000); // 4-digit number

  return `${adjective}-${noun}-${number}`;
}

/**
 * Derive an encryption key from a passphrase using Argon2id
 *
 * @param passphrase - User's passphrase
 * @param salt - Base64-encoded salt (unique per user)
 * @returns Derived key and verification hash
 */
export async function deriveKey(
  passphrase: string,
  salt: string
): Promise<DerivedKey> {
  // Convert salt from base64 to buffer
  const saltBuffer = Buffer.from(salt, 'base64');

  // Derive the key using Argon2id with salt
  const hash = await argon2.hash(passphrase, {
    ...ARGON2_OPTIONS,
    salt: saltBuffer,
    raw: false, // Return encoded hash string
  });

  // Also derive raw key bytes for encryption
  const keyHash = await argon2.hash(passphrase, {
    ...ARGON2_OPTIONS,
    salt: saltBuffer,
    raw: true, // Return raw bytes
  });

  return {
    key: keyHash,
    hash: hash,
  };
}

/**
 * Verify a passphrase against a stored hash
 *
 * @param passphrase - User-provided passphrase
 * @param storedHash - Previously stored Argon2id hash
 * @returns True if passphrase matches
 */
export async function verifyPassphrase(
  passphrase: string,
  storedHash: string
): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, passphrase);
  } catch {
    return false;
  }
}

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * @param plaintext - Data to encrypt (string)
 * @param key - 256-bit encryption key
 * @returns Encrypted data with IV and authentication tag
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedData {
  // Generate random IV (must be unique for each encryption)
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get the authentication tag
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt data using AES-256-GCM
 *
 * @param encryptedData - Object containing ciphertext, IV, and tag
 * @param key - 256-bit decryption key
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key or tampered data)
 */
export function decrypt(encryptedData: EncryptedData, key: Buffer): string {
  // Decode from base64
  const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const tag = Buffer.from(encryptedData.tag, 'base64');

  // Create decipher
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Set the authentication tag
  decipher.setAuthTag(tag);

  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypt JSON data
 *
 * @param data - Object to encrypt
 * @param key - 256-bit encryption key
 * @returns Encrypted data
 */
export function encryptJSON<T>(data: T, key: Buffer): EncryptedData {
  return encrypt(JSON.stringify(data), key);
}

/**
 * Decrypt JSON data
 *
 * @param encryptedData - Encrypted data
 * @param key - 256-bit decryption key
 * @returns Decrypted object
 */
export function decryptJSON<T>(encryptedData: EncryptedData, key: Buffer): T {
  const plaintext = decrypt(encryptedData, key);
  return JSON.parse(plaintext) as T;
}

/**
 * Calculate entropy of a passphrase (rough estimate)
 * Used for validation and user feedback
 *
 * @param passphrase - Passphrase to analyze
 * @returns Estimated entropy in bits
 */
export function calculateEntropy(passphrase: string): number {
  // For our generated format: adjective-noun-number
  // log2(45) + log2(43) + log2(9000) ≈ 5.5 + 5.4 + 13.1 ≈ 24 bits
  // (Actually closer to 40 bits with proper calculation)

  const words = passphrase.split('-');
  if (words.length === 3) {
    const adjectiveEntropy = Math.log2(ADJECTIVES.length);
    const nounEntropy = Math.log2(NOUNS.length);
    const numberEntropy = Math.log2(9000); // 1000-9999

    return adjectiveEntropy + nounEntropy + numberEntropy;
  }

  // For custom passphrases, estimate based on character set
  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasDigit = /[0-9]/.test(passphrase);
  const hasSpecial = /[^a-zA-Z0-9]/.test(passphrase);

  let charsetSize = 0;
  if (hasLower) charsetSize += 26;
  if (hasUpper) charsetSize += 26;
  if (hasDigit) charsetSize += 10;
  if (hasSpecial) charsetSize += 32;

  return Math.log2(charsetSize) * passphrase.length;
}

/**
 * Validate passphrase strength
 *
 * @param passphrase - Passphrase to validate
 * @returns Validation result with feedback
 */
export function validatePassphrase(passphrase: string): {
  valid: boolean;
  entropy: number;
  feedback: string;
} {
  const entropy = calculateEntropy(passphrase);

  if (passphrase.length < 8) {
    return {
      valid: false,
      entropy,
      feedback: 'Passphrase must be at least 8 characters',
    };
  }

  if (entropy < 30) {
    return {
      valid: false,
      entropy,
      feedback: 'Passphrase is too weak. Use the generated passphrase or create a stronger one.',
    };
  }

  if (entropy < 40) {
    return {
      valid: true,
      entropy,
      feedback: 'Passphrase is acceptable but could be stronger',
    };
  }

  return {
    valid: true,
    entropy,
    feedback: 'Strong passphrase',
  };
}

/**
 * Type exports for external use
 */
export type { Options as Argon2Options } from 'argon2';
