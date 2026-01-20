/**
 * Digest Module
 *
 * Exports digest generation and type definitions.
 */

export { generateDigest } from './aggregator';

export type {
  DigestContent,
  DigestItem,
  DigestType,
  DigestUrgency,
  DigestChannel,
  DigestSection,
  DigestStats,
  DigestPreferences,
  DigestDeliveryResult,
  DigestGenerationResult,
  DigestItemSource,
} from './types';
