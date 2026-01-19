/**
 * Temporal Decay Algorithm
 *
 * Implements memory decay over time, where memories gradually fade
 * unless they are accessed (which refreshes them).
 *
 * Key Concepts:
 * - Memory strength decreases exponentially over time
 * - High importance memories decay slower
 * - Accessing a memory refreshes it (resets decay clock)
 * - Different categories have different decay rates
 */

import type { Memory, MemoryWithStrength, DECAY_RATES } from './types';

/**
 * Calculate current strength of a memory based on temporal decay
 *
 * Formula:
 *   strength = exp(-effectiveDecayRate * daysSinceAccess)
 *   effectiveDecayRate = decayRate * (1 - importance * 0.5)
 *
 * Where:
 * - Higher importance reduces effective decay rate (slower decay)
 * - Accessing a memory resets the decay clock
 * - Strength ranges from 0 (completely faded) to 1 (fresh)
 *
 * @param memory - Memory object with decay parameters
 * @returns Current strength value (0-1)
 */
export function calculateMemoryStrength(memory: Memory): number {
  const now = new Date();

  // Calculate age in days
  const ageInDays = (now.getTime() - memory.sourceDate.getTime()) / (1000 * 60 * 60 * 24);

  // Calculate days since last access (or age if never accessed)
  const daysSinceAccess = memory.lastAccessed
    ? (now.getTime() - memory.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
    : ageInDays;

  // Check for hard expiration
  if (memory.expiresAt && now > memory.expiresAt) {
    return 0; // Expired memories have zero strength
  }

  // Calculate effective decay rate
  // High importance (0.8-1.0) reduces decay by up to 50%
  // Low importance (0.0-0.2) has minimal effect on decay
  const importanceModifier = 1 - memory.importance * 0.5;
  const effectiveDecayRate = memory.decayRate * importanceModifier;

  // Exponential decay formula
  // e^(-rate * time) produces smooth decay curve
  const strength = Math.exp(-effectiveDecayRate * daysSinceAccess);

  // Clamp to [0, 1] range
  return Math.max(0, Math.min(1, strength));
}

/**
 * Add strength calculation to a memory object
 *
 * @param memory - Base memory object
 * @returns Memory with calculated strength and timing info
 */
export function addStrengthToMemory(memory: Memory): MemoryWithStrength {
  const now = new Date();
  const ageInDays = (now.getTime() - memory.sourceDate.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceAccess = memory.lastAccessed
    ? (now.getTime() - memory.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
    : ageInDays;

  return {
    ...memory,
    strength: calculateMemoryStrength(memory),
    ageInDays,
    daysSinceAccess,
  };
}

/**
 * Sort memories by decay-weighted relevance
 *
 * Combines:
 * - Memory strength (temporal decay)
 * - Extraction confidence
 * - Importance rating
 *
 * Formula:
 *   score = strength * 0.5 + confidence * 0.3 + importance * 0.2
 *
 * @param memories - List of memories to rank
 * @returns Memories sorted by relevance score (highest first)
 */
export function rankMemoriesByRelevance(memories: Memory[]): MemoryWithStrength[] {
  const memoriesWithStrength = memories.map(addStrengthToMemory);

  return memoriesWithStrength.sort((a, b) => {
    const scoreA = a.strength * 0.5 + a.confidence * 0.3 + a.importance * 0.2;
    const scoreB = b.strength * 0.5 + b.confidence * 0.3 + b.importance * 0.2;
    return scoreB - scoreA; // Descending order
  });
}

/**
 * Filter memories by minimum strength threshold
 *
 * Use this to exclude severely decayed memories from search results.
 *
 * @param memories - List of memories to filter
 * @param minStrength - Minimum strength threshold (0-1)
 * @returns Memories with strength >= minStrength
 */
export function filterByStrength(
  memories: Memory[],
  minStrength: number
): MemoryWithStrength[] {
  return memories
    .map(addStrengthToMemory)
    .filter((m) => m.strength >= minStrength);
}

/**
 * Calculate half-life of a memory (time until strength = 0.5)
 *
 * Useful for understanding how long a memory will remain relevant.
 *
 * Formula:
 *   halfLife = ln(2) / effectiveDecayRate
 *
 * @param memory - Memory object
 * @returns Half-life in days
 */
export function calculateHalfLife(memory: Memory): number {
  const importanceModifier = 1 - memory.importance * 0.5;
  const effectiveDecayRate = memory.decayRate * importanceModifier;

  // Natural log of 2 divided by decay rate
  return Math.log(2) / effectiveDecayRate;
}

/**
 * Predict when a memory will decay below threshold
 *
 * @param memory - Memory object
 * @param threshold - Strength threshold (0-1)
 * @returns Date when memory will decay below threshold
 */
export function predictDecayDate(memory: Memory, threshold: number = 0.1): Date {
  const importanceModifier = 1 - memory.importance * 0.5;
  const effectiveDecayRate = memory.decayRate * importanceModifier;

  // Solve for time when strength = threshold
  // threshold = exp(-rate * time)
  // ln(threshold) = -rate * time
  // time = -ln(threshold) / rate
  const daysUntilThreshold = -Math.log(threshold) / effectiveDecayRate;

  // Calculate from last access (or source date if never accessed)
  const referenceDate = memory.lastAccessed || memory.sourceDate;
  const decayDate = new Date(referenceDate);
  decayDate.setDate(decayDate.getDate() + daysUntilThreshold);

  return decayDate;
}

/**
 * Refresh a memory by updating lastAccessed timestamp
 *
 * This resets the decay clock, giving the memory a "boost" in strength.
 *
 * @param memory - Memory to refresh
 * @returns Updated memory with new lastAccessed timestamp
 */
export function refreshMemory(memory: Memory): Memory {
  return {
    ...memory,
    lastAccessed: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Get decay statistics for a collection of memories
 *
 * @param memories - List of memories to analyze
 * @returns Statistics object
 */
export function getDecayStats(memories: Memory[]): {
  total: number;
  avgStrength: number;
  strongMemories: number;  // strength >= 0.7
  fadingMemories: number;  // 0.3 <= strength < 0.7
  weakMemories: number;    // strength < 0.3
  avgHalfLife: number;
} {
  const memoriesWithStrength = memories.map(addStrengthToMemory);

  const strongMemories = memoriesWithStrength.filter((m) => m.strength >= 0.7).length;
  const fadingMemories = memoriesWithStrength.filter(
    (m) => m.strength >= 0.3 && m.strength < 0.7
  ).length;
  const weakMemories = memoriesWithStrength.filter((m) => m.strength < 0.3).length;

  const avgStrength =
    memoriesWithStrength.reduce((sum, m) => sum + m.strength, 0) / memories.length || 0;

  const avgHalfLife =
    memories.reduce((sum, m) => sum + calculateHalfLife(m), 0) / memories.length || 0;

  return {
    total: memories.length,
    avgStrength,
    strongMemories,
    fadingMemories,
    weakMemories,
    avgHalfLife,
  };
}
