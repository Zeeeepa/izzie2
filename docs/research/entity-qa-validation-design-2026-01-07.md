# Entity QA/Validation Process - Implementation Plan

**Date:** 2026-01-07
**Author:** Research Agent
**Status:** Design Phase
**Goal:** Implement LLM-based entity validation to improve extraction quality and reduce false positives

---

## Executive Summary

This document outlines a comprehensive design for adding a validation/QA layer to the entity extraction pipeline. The validation process will:

1. **Review extracted entities** against original email content
2. **Validate entity type classification** (person vs company vs topic)
3. **Filter low-quality entities** (generic words, email addresses as names)
4. **Merge duplicates** and suggest entity normalization improvements
5. **Run asynchronously** after initial extraction to minimize latency
6. **Optimize for cost** using batch processing and cheaper models

**Expected Impact:**
- 30-50% reduction in false positive entities
- Better entity type accuracy (addressing current person/company confusion)
- Improved entity deduplication across emails
- Minimal cost increase (~15-20% of extraction cost)

---

## Current State Analysis

### Extraction Flow (src/lib/extraction/entity-extractor.ts)

**Current Pipeline:**
```
Email → EntityExtractor.extractFromEmail() → ExtractionResult
  ↓
  Uses: Mistral Small (MODELS.CLASSIFIER)
  Cost: ~$0.0001-0.0003 per email
  Confidence threshold: 0.7
  ↓
  Event: izzie/ingestion.entities.extracted
```

**Identified Quality Issues:**

1. **Person vs Company Confusion** (prompts.ts lines 69-87)
   - Email addresses extracted as person entities
   - Company indicators misclassified (e.g., "Support from Flume" → person instead of company)
   - Generic service names treated as people

2. **Low-Quality Generic Entities**
   - Single words: "Update", "Meeting", "Review"
   - Stop words: "Team", "Support", "Info"
   - Partial names: "Bob" when context shows "Bob Matsuoka"

3. **Duplicate Detection Gaps**
   - Same entity with different normalizations: "john_doe" vs "john"
   - Name variations not merged: "Robert" vs "Bob" vs "Bob Smith"
   - No cross-email entity resolution

4. **No Post-Extraction Validation**
   - Entities saved directly to graph without QA
   - False positives accumulate over time
   - No mechanism to correct or reject entities

### Cost Structure

**Current Extraction Cost (per email):**
- Model: `mistral-small-3.2-24b-instruct`
- Input tokens: ~400-800 (email content + prompt)
- Output tokens: ~200-400 (JSON entities)
- Cost per email: **$0.0001-0.0003**

**Batch Processing (src/lib/extraction/entity-extractor.ts:197-253):**
- Already implements sequential processing with progress tracking
- Cost tracking and logging in place
- Processes 10-50 emails/second

---

## Design Overview

### Validation Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Extraction Pipeline                        │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Step 1: Initial Extraction (EXISTING)                       │
│  - EntityExtractor.extractFromEmail()                        │
│  - Mistral Small classification                              │
│  - Store raw extraction results                              │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Step 2: Entity Validation (NEW - Async)                     │
│  - EntityValidator.validateExtraction()                      │
│  - Batch validation (5-10 emails at once)                    │
│  - Mistral Small for cost efficiency                         │
│  - Output: validated, rejected, corrections                  │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Step 3: Apply Corrections & Deduplication                   │
│  - Merge duplicate entities                                  │
│  - Apply type corrections (person → company)                 │
│  - Filter rejected entities                                  │
│  - Update confidence scores                                  │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Step 4: Persist Validated Entities                          │
│  - Update graph with validated entities                      │
│  - Log rejected entities for analysis                        │
│  - Emit validation metrics event                             │
└──────────────────────────────────────────────────────────────┘
```

### Event Flow

```
Email Ingestion
    ↓
izzie/ingestion.email.extracted
    ↓
extract-entities-from-email (EXISTING)
    ↓
izzie/ingestion.entities.extracted
    ↓ (NEW)
validate-entities (NEW FUNCTION)
    ↓
izzie/ingestion.entities.validated (NEW EVENT)
    ↓
update-graph-with-validated-entities
```

---

## Implementation Plan

### 1. File Structure

**New Files:**
```
src/lib/extraction/
├── entity-validator.ts          # NEW: Core validation logic
├── validation-prompts.ts        # NEW: Validation-specific prompts
├── validation-types.ts          # NEW: Types for validation results
└── deduplication.ts             # NEW: Entity merging and deduplication

src/lib/events/functions/
└── validate-entities.ts         # NEW: Inngest function for validation

src/lib/db/
└── validation-logs.ts           # NEW: Store rejected entities for analysis
```

**Modified Files:**
```
src/lib/extraction/types.ts      # Add validation result types
src/lib/events/types.ts          # Add validation event payloads
```

### 2. Core Validation Module (entity-validator.ts)

**Location:** `src/lib/extraction/entity-validator.ts`

**Key Features:**
- Batch validation (5-10 extractions at once)
- Cost-optimized using Mistral Small
- Outputs: validated, rejected, corrections, merges

**Class Structure:**
```typescript
export class EntityValidator {
  private config: ValidationConfig;
  private client = getAIClient();

  // Main validation method
  async validateExtraction(
    extraction: ExtractionResult,
    email: Email
  ): Promise<ValidationResult>

  // Batch validation (cost optimization)
  async validateBatch(
    extractions: Array<{ extraction: ExtractionResult; email: Email }>
  ): Promise<ValidationResult[]>

  // Individual validation checks
  private validateEntityType(entity: Entity, context: string): TypeValidation
  private validateEntityQuality(entity: Entity): QualityCheck
  private detectDuplicates(entities: Entity[]): DuplicateGroup[]

  // Parse validation response
  private parseValidationResponse(content: string): ValidationResult
}
```

**Validation Config:**
```typescript
interface ValidationConfig {
  batchSize: number;              // 5-10 emails per batch
  minConfidenceIncrease: number;  // Boost confidence by 0.1 if validated
  maxConfidenceDecrease: number;  // Reduce by 0.3 if questionable
  rejectThreshold: number;        // Reject if confidence < 0.5 after validation
  enableTypeCorrection: boolean;  // Auto-correct person→company
  enableDuplicateMerge: boolean;  // Auto-merge obvious duplicates
  strictMode: boolean;            // Reject ambiguous entities
}
```

### 3. Validation Prompts (validation-prompts.ts)

**Location:** `src/lib/extraction/validation-prompts.ts`

**Prompt Strategy:**

```typescript
export function buildValidationPrompt(
  extraction: ExtractionResult,
  email: Email
): string {
  return `You are an entity validation expert. Review these extracted entities and classify each as:

**VALIDATED** - Correct entity type and high quality
**CORRECTED** - Wrong type, provide correction
**REJECTED** - Low quality, generic, or error

**Original Email:**
From: ${email.from.name || email.from.email}
To: ${email.to.map(t => t.name || t.email).join(', ')}
Subject: ${email.subject}
Body Preview: ${email.body.slice(0, 500)}

**Extracted Entities:**
${JSON.stringify(extraction.entities, null, 2)}

**Validation Rules:**

1. **Person Entities** - ONLY if:
   ✓ Full human name (first + last)
   ✓ Found in To/From/CC headers
   ✗ Email addresses (bob@example.com)
   ✗ Generic names ("Support", "Team")
   ✗ Company names

2. **Company Entities** - Check for:
   ✓ Known companies (Google, Apple, etc.)
   ✓ "[X] Support", "[X] Team", "[X] Notifications"
   ✓ Domain-based companies (from email domain)
   ✗ Person names
   ✗ Generic words

3. **Quality Filters** - REJECT if:
   ✗ Generic words ("Update", "Meeting", "Info")
   ✗ Single common words ("Review", "Question")
   ✗ Stop words or filler text
   ✗ Partial names when full name available

4. **Duplicate Detection** - MERGE if:
   ✓ Same person (Bob → Bob Smith)
   ✓ Same company (Apple → Apple Inc)
   ✓ Nicknames (Robert → Bob)

**Response Format (JSON only):**
{
  "validated": [
    {
      "entity": { /* original entity */ },
      "newConfidence": 0.95,
      "reason": "Full name in To header"
    }
  ],
  "corrected": [
    {
      "entity": { /* original entity */ },
      "correction": {
        "type": "company",
        "value": "Flume",
        "normalized": "flume"
      },
      "reason": "Support from Flume → company, not person",
      "confidence": 0.9
    }
  ],
  "rejected": [
    {
      "entity": { /* original entity */ },
      "reason": "Generic word - not a real entity",
      "confidence": 0.2
    }
  ],
  "duplicates": [
    {
      "entities": [
        { "value": "Bob", "normalized": "bob" },
        { "value": "Bob Matsuoka", "normalized": "bob_matsuoka" }
      ],
      "mergeInto": {
        "value": "Bob Matsuoka",
        "normalized": "bob_matsuoka"
      },
      "reason": "Same person, use full name"
    }
  ],
  "metrics": {
    "totalReviewed": 10,
    "validated": 6,
    "corrected": 2,
    "rejected": 2,
    "duplicates": 1
  }
}

Respond with JSON only.`;
}
```

**Batch Validation Prompt:**
```typescript
export function buildBatchValidationPrompt(
  extractions: Array<{ extraction: ExtractionResult; email: Email }>
): string {
  // Similar structure but processes 5-10 emails at once
  // Groups results by emailId
  // More cost-efficient for large-scale validation
}
```

### 4. Validation Types (validation-types.ts)

**Location:** `src/lib/extraction/validation-types.ts`

```typescript
export interface ValidationResult {
  emailId: string;
  validated: ValidatedEntity[];      // Entities that passed validation
  corrected: CorrectedEntity[];      // Entities with type/value corrections
  rejected: RejectedEntity[];        // Entities filtered out
  duplicates: DuplicateGroup[];      // Entities to merge
  metrics: ValidationMetrics;
  validatedAt: Date;
  cost: number;
  model: string;
}

export interface ValidatedEntity {
  entity: Entity;
  newConfidence: number;  // Boosted confidence score
  reason: string;
}

export interface CorrectedEntity {
  entity: Entity;
  correction: {
    type?: EntityType;
    value?: string;
    normalized?: string;
  };
  reason: string;
  confidence: number;
}

export interface RejectedEntity {
  entity: Entity;
  reason: string;
  confidence: number;  // Low confidence score
}

export interface DuplicateGroup {
  entities: Entity[];
  mergeInto: {
    value: string;
    normalized: string;
    type: EntityType;
  };
  reason: string;
  confidence: number;
}

export interface ValidationMetrics {
  totalReviewed: number;
  validated: number;
  corrected: number;
  rejected: number;
  duplicates: number;
  averageConfidenceBefore: number;
  averageConfidenceAfter: number;
}

export interface ValidationConfig {
  batchSize: number;
  minConfidenceIncrease: number;
  maxConfidenceDecrease: number;
  rejectThreshold: number;
  enableTypeCorrection: boolean;
  enableDuplicateMerge: boolean;
  strictMode: boolean;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  batchSize: 5,
  minConfidenceIncrease: 0.1,
  maxConfidenceDecrease: 0.3,
  rejectThreshold: 0.5,
  enableTypeCorrection: true,
  enableDuplicateMerge: true,
  strictMode: false,
};
```

### 5. Deduplication Module (deduplication.ts)

**Location:** `src/lib/extraction/deduplication.ts`

**Features:**
- Cross-email entity resolution
- Name variation detection (Robert/Bob/Rob)
- Company normalization (Apple Inc/Apple/AAPL)
- Confidence-based merging

```typescript
export class EntityDeduplicator {
  /**
   * Detect duplicates within a single extraction
   */
  detectIntraEmailDuplicates(entities: Entity[]): DuplicateGroup[]

  /**
   * Detect duplicates across multiple emails (batch)
   */
  detectCrossEmailDuplicates(
    extractions: ExtractionResult[]
  ): DuplicateGroup[]

  /**
   * Merge duplicate entities
   */
  mergeDuplicates(
    entities: Entity[],
    duplicateGroups: DuplicateGroup[]
  ): Entity[]

  /**
   * Calculate similarity between two entities
   */
  private calculateSimilarity(e1: Entity, e2: Entity): number

  /**
   * Normalize entity for comparison
   */
  private normalizeForComparison(entity: Entity): string
}
```

**Similarity Algorithm:**
```typescript
function calculateSimilarity(e1: Entity, e2: Entity): number {
  // 1. Exact match on normalized name → 1.0
  if (e1.normalized === e2.normalized) return 1.0;

  // 2. Type must match
  if (e1.type !== e2.type) return 0.0;

  // 3. Name variation detection
  const score = fuzzyMatch(e1.value, e2.value);

  // 4. Common patterns
  // "Bob" in "Bob Matsuoka" → 0.85
  // "Apple Inc" vs "Apple" → 0.90
  // "john_doe" vs "john" → 0.75

  return score;
}
```

### 6. Inngest Function (validate-entities.ts)

**Location:** `src/lib/events/functions/validate-entities.ts`

```typescript
export const validateEntities = inngest.createFunction(
  {
    id: 'validate-entities',
    name: 'Validate Extracted Entities',
    retries: 2,
  },
  { event: 'izzie/ingestion.entities.extracted' },
  async ({ event, step }) => {
    const { userId, sourceId, sourceType, entities, extractedAt } = event.data;

    console.log(`[ValidateEntities] Validating ${entities.length} entities from ${sourceType} ${sourceId}`);

    // Step 1: Fetch original email content
    const email = await step.run('fetch-email-content', async () => {
      // Get email from database or cache
      return await fetchEmail(sourceId);
    });

    // Step 2: Run validation
    const validationResult = await step.run('validate-entities', async () => {
      const validator = new EntityValidator();

      const extraction: ExtractionResult = {
        emailId: sourceId,
        entities,
        spam: event.data.spam,
        extractedAt: new Date(extractedAt),
        cost: event.data.cost,
        model: event.data.model,
      };

      return await validator.validateExtraction(extraction, email);
    });

    // Step 3: Apply corrections and merges
    const finalEntities = await step.run('apply-corrections', async () => {
      let result = [...validationResult.validated.map(v => ({
        ...v.entity,
        confidence: v.newConfidence,
      }))];

      // Apply corrections
      for (const correction of validationResult.corrected) {
        result.push({
          ...correction.entity,
          ...correction.correction,
          confidence: correction.confidence,
        });
      }

      // Merge duplicates
      if (validationResult.duplicates.length > 0) {
        result = mergeDuplicateEntities(result, validationResult.duplicates);
      }

      return result;
    });

    // Step 4: Emit validated entities event
    await step.run('emit-validated-event', async () => {
      await inngest.send({
        name: 'izzie/ingestion.entities.validated',
        data: {
          userId,
          sourceId,
          sourceType,
          entities: finalEntities,
          validationMetrics: validationResult.metrics,
          rejectedEntities: validationResult.rejected,
          validatedAt: validationResult.validatedAt.toISOString(),
          cost: validationResult.cost,
          model: validationResult.model,
        },
      });
    });

    // Step 5: Log rejected entities for analysis
    await step.run('log-rejected-entities', async () => {
      if (validationResult.rejected.length > 0) {
        await logRejectedEntities(sourceId, validationResult.rejected);
      }
    });

    return {
      sourceId,
      originalCount: entities.length,
      validatedCount: finalEntities.length,
      rejectedCount: validationResult.rejected.length,
      correctedCount: validationResult.corrected.length,
      duplicatesCount: validationResult.duplicates.length,
      metrics: validationResult.metrics,
      cost: validationResult.cost,
    };
  }
);
```

### 7. Batch Validation Strategy

**When to Use Batch Validation:**
- Large-scale email ingestion (100+ emails)
- Nightly cleanup jobs
- Manual validation triggers

**Batch Function:**
```typescript
export const validateEntitiesBatch = inngest.createFunction(
  {
    id: 'validate-entities-batch',
    name: 'Batch Validate Entities',
    retries: 2,
  },
  { event: 'izzie/validation.batch.trigger' },
  async ({ event, step }) => {
    const { userId, emailIds } = event.data;

    // Process in batches of 5-10 emails
    const batchSize = 5;
    const batches = chunk(emailIds, batchSize);

    for (const batch of batches) {
      await step.run(`validate-batch-${batch[0]}`, async () => {
        const validator = new EntityValidator();

        // Fetch emails and extractions
        const emailData = await fetchEmailsWithExtractions(batch);

        // Batch validation (cost-efficient)
        const results = await validator.validateBatch(emailData);

        // Process each result
        for (const result of results) {
          // Apply corrections, emit events, etc.
        }

        return {
          batchSize: batch.length,
          totalCost: results.reduce((sum, r) => sum + r.cost, 0),
        };
      });
    }
  }
);
```

---

## Cost Analysis

### Current Costs (No Validation)
```
Email extraction: $0.0001-0.0003 per email
Average: $0.0002 per email
1000 emails: $0.20
```

### With Validation (Proposed)
```
Email extraction: $0.0002 per email
Validation (single): $0.00015 per email
Validation (batch): $0.00003 per email (5-email batches)

1000 emails (single validation): $0.35 (+75%)
1000 emails (batch validation): $0.23 (+15%)
```

### Cost Optimization Strategies

**1. Batch Validation (Recommended)**
- Process 5-10 emails per API call
- Share prompt overhead across emails
- Reduces cost by 80% compared to single validation

**2. Selective Validation**
- Only validate high-entity-count emails (>5 entities)
- Skip validation for obvious spam
- Reduces validation by ~40%

**3. Confidence-Based Validation**
- Only validate entities with confidence 0.5-0.8
- Skip high-confidence (>0.8) and low-confidence (<0.5)
- Reduces validation tokens by ~30%

**Recommended Approach:**
Use **batch validation** with **selective triggering**:
- Batch size: 5 emails
- Only validate non-spam emails
- Process during off-peak hours
- **Expected cost increase: 15-20%**

---

## Performance & Trade-offs

### Performance Metrics

**Single Email Validation:**
- Latency: +200-400ms per email
- Throughput: 3-5 emails/second
- Use case: Real-time validation for high-value emails

**Batch Validation:**
- Latency: 1-2 seconds per 5-email batch
- Throughput: 15-25 emails/second
- Use case: Async validation queue

**Trade-off Analysis:**

| Approach | Cost | Latency | Quality | Complexity |
|----------|------|---------|---------|------------|
| No Validation | $0.0002 | 0ms | Baseline | Low |
| Single Validation | $0.00035 | +300ms | +40% | Medium |
| Batch Validation | $0.00023 | +2s async | +40% | Medium |
| Selective Batch | $0.00018 | +2s async | +35% | High |

**Recommended:** **Batch Validation** (async)
- Best cost/quality balance
- No user-facing latency
- Moderate complexity

### Quality Improvements (Expected)

**Entity Type Accuracy:**
- Before: 70-80% correct type classification
- After: 90-95% correct type classification
- Impact: Fewer person/company confusions

**False Positive Reduction:**
- Before: ~30% false positives (generic words, etc.)
- After: ~5-10% false positives
- Impact: Cleaner entity graph, better search

**Duplicate Reduction:**
- Before: ~20% duplicate entities across emails
- After: ~5% duplicate entities
- Impact: Better entity normalization

---

## Implementation Phases

### Phase 1: Core Validation (Week 1)
**Goal:** Basic validation infrastructure

**Tasks:**
1. Create `entity-validator.ts` with single-email validation
2. Create `validation-prompts.ts` with validation prompt
3. Create `validation-types.ts` with type definitions
4. Write unit tests for validation logic
5. Test on sample emails (10-20 emails)

**Deliverables:**
- Working `EntityValidator` class
- Validation prompt tested and refined
- Initial cost/quality metrics

**Success Criteria:**
- 80%+ correct type validations
- <$0.0003 per email validation cost
- <500ms validation latency

### Phase 2: Deduplication (Week 2)
**Goal:** Entity merging and normalization

**Tasks:**
1. Create `deduplication.ts` with similarity algorithms
2. Implement name variation detection
3. Implement cross-email duplicate detection
4. Write unit tests for deduplication
5. Test on 100+ email corpus

**Deliverables:**
- Working `EntityDeduplicator` class
- Similarity algorithm with >85% accuracy
- Cross-email duplicate detection

**Success Criteria:**
- 80%+ duplicate detection accuracy
- <10% false positive merges
- Improved entity normalization

### Phase 3: Batch Processing (Week 3)
**Goal:** Cost-optimized batch validation

**Tasks:**
1. Implement `validateBatch()` method
2. Create batch validation prompt
3. Optimize batch size (test 3, 5, 10 emails)
4. Implement batch event handler
5. Test on 500+ email corpus

**Deliverables:**
- Batch validation with 5-email batches
- Cost reduction to <$0.00005 per email
- Throughput: 15-25 emails/second

**Success Criteria:**
- 80% cost reduction vs single validation
- Same quality as single validation
- Reliable batch processing

### Phase 4: Integration (Week 4)
**Goal:** Production deployment

**Tasks:**
1. Create Inngest function `validate-entities.ts`
2. Add validation event types
3. Update graph builder to use validated entities
4. Add validation metrics dashboard
5. Deploy to staging

**Deliverables:**
- Full validation pipeline in Inngest
- Metrics tracking and logging
- Staging deployment

**Success Criteria:**
- <1% validation failures
- Zero data loss
- Observable metrics

### Phase 5: Monitoring & Optimization (Week 5)
**Goal:** Production refinement

**Tasks:**
1. Monitor validation accuracy in production
2. Tune validation prompts based on failures
3. Implement selective validation triggers
4. Add rejected entity analysis dashboard
5. Optimize costs based on usage patterns

**Deliverables:**
- Production metrics dashboard
- Refined validation prompts
- Cost optimization strategies

**Success Criteria:**
- 90%+ validation accuracy
- <20% cost increase over baseline
- Measurable improvement in entity quality

---

## Migration Strategy

### Backward Compatibility

**Option 1: Parallel Processing (Recommended)**
```
Email → Extract → [Old Path] → Graph (unvalidated)
              ↓
              [New Path] → Validate → Graph (validated, separate nodes)
```

**Advantages:**
- No breaking changes
- Can compare old vs new quality
- Gradual rollout

**Option 2: Full Replacement**
```
Email → Extract → Validate → Graph (validated only)
```

**Advantages:**
- Cleaner architecture
- Lower storage costs

**Recommended:** Start with **Option 1**, migrate to **Option 2** after validation in production

### Rollout Plan

**Week 1-2: Shadow Mode**
- Run validation but don't persist results
- Compare validation output vs extraction output
- Measure accuracy and cost

**Week 3: Partial Rollout (10%)**
- Enable for 10% of users
- Monitor metrics closely
- Tune prompts based on feedback

**Week 4: Full Rollout (100%)**
- Enable for all users
- Continuous monitoring
- Quick rollback if issues

---

## Monitoring & Metrics

### Key Metrics to Track

**Quality Metrics:**
1. Validation accuracy (manual review of 100 samples/week)
2. False positive rate (generic entities, wrong types)
3. False negative rate (real entities rejected)
4. Duplicate detection accuracy

**Cost Metrics:**
1. Average cost per email validation
2. Total validation cost per day/week
3. Cost increase % over baseline extraction
4. Batch efficiency (cost per email in batch)

**Performance Metrics:**
1. Validation latency (p50, p95, p99)
2. Validation throughput (emails/second)
3. Error rate (validation failures)
4. Retry rate

**Business Impact Metrics:**
1. Entity graph quality improvement
2. Search relevance improvement
3. User satisfaction with entity accuracy
4. Entity churn rate (entities created then deleted)

### Dashboards

**Validation Overview Dashboard:**
```
┌─────────────────────────────────────────────────┐
│ Validation Metrics (Last 24h)                  │
├─────────────────────────────────────────────────┤
│ Total Validated: 1,234 emails                  │
│ Avg Entities/Email: 4.2 → 3.1 (after validation)│
│ Rejection Rate: 26%                            │
│ Correction Rate: 15%                           │
│ Duplicate Merge Rate: 12%                      │
│ Avg Cost/Email: $0.00023                       │
│ Total Cost: $0.28                              │
└─────────────────────────────────────────────────┘
```

**Entity Quality Dashboard:**
```
┌─────────────────────────────────────────────────┐
│ Entity Type Distribution (After Validation)    │
├─────────────────────────────────────────────────┤
│ Person:      45% (720 entities)                │
│ Company:     30% (480 entities)                │
│ Topic:       15% (240 entities)                │
│ Project:     10% (160 entities)                │
│                                                 │
│ Top Rejections:                                 │
│ 1. Generic words (35%)                         │
│ 2. Email addresses as names (28%)              │
│ 3. Partial names (20%)                         │
│ 4. Type misclassification (17%)                │
└─────────────────────────────────────────────────┘
```

---

## Error Handling & Edge Cases

### Error Scenarios

**1. Validation API Failure**
```typescript
try {
  const result = await validator.validateExtraction(extraction, email);
} catch (error) {
  // Fallback: Accept original extraction without validation
  console.error('[Validation] Failed, using original extraction');
  return extraction.entities;
}
```

**2. Partial Validation Response**
```typescript
if (result.validated.length === 0 && result.rejected.length === 0) {
  // LLM returned empty response
  console.warn('[Validation] Empty response, retrying...');
  // Retry with different prompt or accept original
}
```

**3. Over-Aggressive Rejection**
```typescript
if (result.rejected.length > 0.8 * extraction.entities.length) {
  // Validation rejected >80% of entities (likely error)
  console.error('[Validation] Over-aggressive rejection detected');
  // Human review or accept original extraction
}
```

**4. Batch Processing Failure**
```typescript
// Process each email individually if batch fails
if (batchResult.error) {
  console.warn('[Validation] Batch failed, falling back to single validation');
  for (const email of batch) {
    await validator.validateExtraction(email.extraction, email.email);
  }
}
```

### Edge Cases

**1. Empty Entity Lists**
- Skip validation if extraction found 0 entities
- No cost, no processing

**2. High-Confidence Entities (>0.95)**
- Option: Skip validation for very high confidence
- Trade-off: Cost savings vs potential false positives

**3. Spam Emails**
- Skip validation entirely (already marked as spam)
- Cost savings: ~20-30% of emails

**4. Calendar Events**
- Different validation rules (people always valid from attendees)
- Separate validation prompt for calendar entities

---

## Testing Strategy

### Unit Tests

**entity-validator.test.ts:**
```typescript
describe('EntityValidator', () => {
  describe('validateExtraction', () => {
    it('should validate correct person entities');
    it('should reject email addresses as person names');
    it('should correct person → company misclassifications');
    it('should reject generic single words');
    it('should boost confidence for validated entities');
  });

  describe('parseValidationResponse', () => {
    it('should parse JSON validation response');
    it('should handle malformed JSON gracefully');
    it('should validate response structure');
  });
});
```

**deduplication.test.ts:**
```typescript
describe('EntityDeduplicator', () => {
  it('should detect exact duplicates');
  it('should detect name variations (Bob → Robert)');
  it('should merge partial names (Bob → Bob Smith)');
  it('should calculate similarity scores correctly');
  it('should handle cross-email duplicates');
});
```

### Integration Tests

**validation-pipeline.test.ts:**
```typescript
describe('Validation Pipeline', () => {
  it('should validate and persist entities end-to-end');
  it('should handle batch validation correctly');
  it('should emit validation events');
  it('should log rejected entities');
  it('should update entity confidence scores');
});
```

### Manual Testing Checklist

**Week 1: Core Validation**
- [ ] Test on 20 sample emails (varied types)
- [ ] Verify person vs company classification accuracy
- [ ] Check rejection reasons are accurate
- [ ] Measure cost per validation

**Week 2: Deduplication**
- [ ] Test duplicate detection on known duplicates
- [ ] Verify name variation matching
- [ ] Check cross-email entity resolution
- [ ] Measure deduplication accuracy

**Week 3: Batch Processing**
- [ ] Test batch sizes: 3, 5, 10 emails
- [ ] Verify batch cost efficiency
- [ ] Check batch throughput
- [ ] Test error handling in batch mode

**Week 4: Integration**
- [ ] End-to-end pipeline test (100 emails)
- [ ] Verify Inngest events fire correctly
- [ ] Check graph updates with validated entities
- [ ] Test rollback scenarios

**Week 5: Production**
- [ ] Monitor metrics for 1 week
- [ ] Manual review of 100 validated emails
- [ ] Tune prompts based on failures
- [ ] Optimize costs based on usage

---

## Future Enhancements

### Phase 2 (Post-Launch)

**1. ML-Based Validation**
- Train small classifier on validated entities
- Replace LLM for simple validations
- Cost reduction: 90%+

**2. User Feedback Loop**
- Allow users to correct entity types
- Feed corrections back into validation
- Continuous improvement

**3. Cross-Source Entity Resolution**
- Link email entities with calendar entities
- Link with contact book
- Unified entity graph

**4. Smart Batch Optimization**
- Dynamic batch sizing based on entity count
- Prioritize high-value emails
- Skip low-value emails

**5. Entity Confidence Learning**
- Track which entities are never queried
- Lower confidence over time
- Auto-archive low-engagement entities

---

## Success Criteria

### MVP Success (Phase 1-4)

**Quality Metrics:**
- ✅ 90%+ correct entity type classification
- ✅ <10% false positive entities
- ✅ 80%+ duplicate detection accuracy
- ✅ <5% false negative rate (valid entities rejected)

**Cost Metrics:**
- ✅ <25% cost increase over baseline extraction
- ✅ <$0.0003 per email validation (batch mode)
- ✅ <$50/month validation costs (for 100k emails/month)

**Performance Metrics:**
- ✅ <500ms single validation latency
- ✅ >15 emails/second batch throughput
- ✅ <1% validation error rate

**Business Metrics:**
- ✅ Measurable improvement in entity graph quality
- ✅ User satisfaction with entity accuracy
- ✅ Reduced manual entity cleanup

---

## Appendix: Prompt Examples

### Example Validation Input

```json
{
  "emailId": "abc123",
  "extractedAt": "2026-01-07T10:00:00Z",
  "entities": [
    {
      "type": "person",
      "value": "support@flume.com",
      "normalized": "support",
      "confidence": 0.75,
      "source": "metadata",
      "context": "From: support@flume.com"
    },
    {
      "type": "person",
      "value": "Bob",
      "normalized": "bob",
      "confidence": 0.8,
      "source": "metadata",
      "context": "To: Bob Matsuoka <bob@example.com>"
    },
    {
      "type": "company",
      "value": "Flume Support",
      "normalized": "flume_support",
      "confidence": 0.7,
      "source": "subject"
    }
  ],
  "email": {
    "from": { "email": "support@flume.com" },
    "to": [{ "name": "Bob Matsuoka", "email": "bob@example.com" }],
    "subject": "Flume Support: Your account issue",
    "body": "Hi Bob, we've resolved your account issue..."
  }
}
```

### Example Validation Output

```json
{
  "emailId": "abc123",
  "validated": [
    {
      "entity": {
        "type": "person",
        "value": "Bob Matsuoka",
        "normalized": "bob_matsuoka",
        "confidence": 0.95,
        "source": "metadata"
      },
      "newConfidence": 0.95,
      "reason": "Full name in To header, email context confirms"
    }
  ],
  "corrected": [
    {
      "entity": {
        "type": "person",
        "value": "support@flume.com",
        "normalized": "support",
        "confidence": 0.75
      },
      "correction": {
        "type": "company",
        "value": "Flume",
        "normalized": "flume"
      },
      "reason": "Email address from Flume domain → company entity",
      "confidence": 0.9
    }
  ],
  "rejected": [
    {
      "entity": {
        "type": "company",
        "value": "Flume Support",
        "normalized": "flume_support",
        "confidence": 0.7
      },
      "reason": "Duplicate of corrected Flume company entity",
      "confidence": 0.3
    }
  ],
  "duplicates": [
    {
      "entities": [
        { "value": "Bob", "normalized": "bob", "type": "person" },
        { "value": "Bob Matsuoka", "normalized": "bob_matsuoka", "type": "person" }
      ],
      "mergeInto": {
        "value": "Bob Matsuoka",
        "normalized": "bob_matsuoka",
        "type": "person"
      },
      "reason": "Same person, partial name vs full name",
      "confidence": 0.95
    }
  ],
  "metrics": {
    "totalReviewed": 3,
    "validated": 1,
    "corrected": 1,
    "rejected": 1,
    "duplicates": 1,
    "averageConfidenceBefore": 0.75,
    "averageConfidenceAfter": 0.93
  },
  "validatedAt": "2026-01-07T10:00:01Z",
  "cost": 0.00015,
  "model": "mistral-small-3.2-24b-instruct"
}
```

---

## Questions for Discussion

1. **Validation Timing:** Should validation run immediately after extraction (adds latency) or async in background (delayed entity availability)?
   - **Recommendation:** Async background validation (non-blocking)

2. **Validation Strictness:** Should validation be strict (reject ambiguous) or permissive (keep unless clearly wrong)?
   - **Recommendation:** Permissive initially, tune based on feedback

3. **Cost Budget:** What's the acceptable cost increase for validation?
   - **Recommendation:** 15-20% increase acceptable for 40% quality improvement

4. **Rollback Strategy:** If validation quality is poor, should we auto-rollback or require manual intervention?
   - **Recommendation:** Auto-rollback if >50% rejection rate detected

5. **User Visibility:** Should users see "validation in progress" or just updated entities?
   - **Recommendation:** Transparent: show validation status in UI

---

## Conclusion

This validation layer will significantly improve entity extraction quality while maintaining reasonable costs. The phased implementation approach allows for iterative improvement and risk mitigation.

**Key Benefits:**
- ✅ 30-50% reduction in false positives
- ✅ Better person/company classification
- ✅ Improved entity deduplication
- ✅ Only 15-20% cost increase (batch mode)
- ✅ No user-facing latency (async validation)

**Next Steps:**
1. Review this design with team
2. Start Phase 1: Core validation infrastructure
3. Test on small email corpus (20-50 emails)
4. Iterate based on results

**Timeline:** 4-5 weeks to production-ready validation pipeline

---

**Document Status:** Draft for Review
**Last Updated:** 2026-01-07
**Author:** Research Agent
**Reviewers:** [To be assigned]
