# Gmail Entity Extraction: Zero Entities Investigation

**Date**: 2026-01-17
**Issue**: Gmail extraction processed 1 email successfully but extracted 0 entities
**Status**: Root cause identified - Multiple silent failure points

---

## Executive Summary

The Gmail entity extraction flow has **5 critical points** where entities can be silently dropped, resulting in 0 entities extracted despite successful email processing. The most likely causes are:

1. **AI response parsing failures** (invalid JSON or missing fields)
2. **Confidence threshold filtering** (entities below 0.7 threshold)
3. **Entity validation failures** (missing required fields)
4. **Empty email content** (no body text to extract from)
5. **AI model returning empty entity arrays**

All of these failure modes are **logged but don't throw errors**, causing silent failures that appear successful to the user.

---

## Entity Extraction Flow Analysis

### Complete Flow Path

```
User triggers sync
    ↓
src/app/api/gmail/sync-user/route.ts::startUserSync()
    ↓
Fetch email from Gmail API (lines 260-264)
    ↓
Parse email headers and body (lines 267-288)
    ↓
Build Email object (lines 293-312)
    ↓
src/lib/extraction/entity-extractor.ts::extractFromEmail()
    ↓
Build extraction prompt (line 40)
    ↓
src/lib/extraction/prompts.ts::buildExtractionPrompt()
    ↓
Call AI model (Mistral Small) via OpenRouter (lines 44-59)
    ↓
src/lib/ai/client.ts::chat()
    ↓
Parse JSON response (line 62)
    ↓
parseExtractionResponse() [CRITICAL FILTER #1]
    ↓
Filter by confidence threshold (lines 65-67) [CRITICAL FILTER #2]
    ↓
Return ExtractionResult with filtered entities
    ↓
Check if entities.length > 0 (line 323 in sync-user route)
    ↓
If > 0: Save to graph via processExtraction()
    ↓
If = 0: Skip graph processing (silent)
```

---

## Critical Failure Points

### 1. JSON Parsing Failures (`parseExtractionResponse`)

**Location**: `src/lib/extraction/entity-extractor.ts:346-406`

**Failure Modes**:

```typescript
// No JSON found in response
const jsonMatch = content.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.warn(`${LOG_PREFIX} No JSON found in response`);
  return { entities: [], spam: { isSpam: false, spamScore: 0 } }; // ❌ SILENT FAILURE
}

// Invalid response structure - missing entities array
if (!parsed.entities || !Array.isArray(parsed.entities)) {
  console.warn(`${LOG_PREFIX} Invalid response structure - missing or invalid 'entities' array`);
  return { entities: [], spam: { isSpam: false, spamScore: 0 } }; // ❌ SILENT FAILURE
}

// JSON parse error
catch (error) {
  console.error(`${LOG_PREFIX} Failed to parse JSON response:`, error);
  return { entities: [], spam: { isSpam: false, spamScore: 0 } }; // ❌ SILENT FAILURE
}
```

**Impact**: If Mistral returns:
- Plain text instead of JSON
- Malformed JSON
- JSON without "entities" field
- JSON with "entities" as non-array

Result: 0 entities extracted, logged but not reported as error

---

### 2. Entity Validation Filtering

**Location**: `src/lib/extraction/entity-extractor.ts:374-382`

**Validation Logic**:

```typescript
const validEntities = parsed.entities.filter((entity: any) => {
  return (
    entity.type &&           // Must have type
    entity.value &&          // Must have value
    entity.normalized &&     // Must have normalized name
    typeof entity.confidence === 'number' && // Must have numeric confidence
    entity.source            // Must have source
  );
});
```

**Impact**: If AI returns entities missing ANY required field, they are **silently dropped** with no logging.

Example of silently dropped entity:
```json
{
  "type": "person",
  "value": "John Doe",
  // ❌ Missing "normalized" field
  "confidence": 0.9,
  "source": "metadata"
}
```

---

### 3. Confidence Threshold Filtering

**Location**: `src/lib/extraction/entity-extractor.ts:65-67`

**Filter Logic**:

```typescript
const filteredEntities = parsed.entities.filter(
  (entity) => entity.confidence >= this.config.minConfidence // Default: 0.7
);
```

**Impact**: If AI assigns low confidence scores (< 0.7), entities are **silently filtered out**.

**Default Config**: `src/lib/extraction/types.ts:101-107`
```typescript
export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  minConfidence: 0.7, // ❌ 70% threshold - may be too high
  extractFromMetadata: true,
  extractFromSubject: true,
  extractFromBody: true,
  normalizeEntities: true,
};
```

**Example**: Entity with confidence 0.65 is dropped:
```json
{
  "type": "company",
  "value": "Acme Corp",
  "normalized": "acme_corp",
  "confidence": 0.65, // ❌ Below 0.7 threshold
  "source": "body"
}
```

---

### 4. Empty Email Body Extraction

**Location**: `src/app/api/gmail/sync-user/route.ts:276-288`

**Body Extraction Logic**:

```typescript
let body = '';
if (fullMessage.data.payload?.body?.data) {
  body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8');
} else if (fullMessage.data.payload?.parts) {
  const textPart = fullMessage.data.payload.parts.find(
    (p) => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
  );
  if (textPart?.body?.data) {
    body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
  }
}
```

**Failure Cases**:
- Email has no body data
- Email is HTML-only with images (no text/plain part)
- Email has multipart/alternative structure not handled
- Base64 decoding issues

**Impact**: If body is empty and config only extracts from body, result = 0 entities.

---

### 5. AI Model Response Issues

**Model Used**: `mistralai/mistral-small-3.2-24b-instruct`
**Location**: `src/lib/ai/models.ts:8`

**Potential Issues**:
- Model returns empty entities array: `{"entities": [], "spam": {...}}`
- Model misunderstands prompt
- Model rate-limited (returns empty response)
- OpenRouter API issues

**Evidence from prompt** (`src/lib/extraction/prompts.ts:38-126`):

The prompt has **strict rules** that may cause entities to be filtered:

```
**CRITICAL PERSON vs COMPANY RULES:**
1. DO NOT extract person entities from email body text - ONLY from To/CC/From headers
2. Email addresses are NOT person names
3. Company indicators - these are COMPANIES, not people:
   - "Support from [X]" → X is a company
   - "[X] Team" or "Team at [X]" → X is a company
```

**Impact**: If email contains only company mentions or support addresses, person extraction = 0.

---

## Error Handling Analysis

### Exception Handling in `extractFromEmail`

**Location**: `src/lib/extraction/entity-extractor.ts:77-88`

```typescript
try {
  // ... extraction logic
} catch (error) {
  console.error(`${LOG_PREFIX} Failed to extract from email ${email.id}:`, error);
  // Return empty result on error
  return {
    emailId: email.id,
    entities: [], // ❌ Empty entities on ANY error
    spam: { isSpam: false, spamScore: 0 },
    extractedAt: new Date(),
    cost: 0,
    model: MODELS.CLASSIFIER,
  };
}
```

**Impact**: ANY exception during extraction returns 0 entities with no error propagation. Possible exceptions:
- AI client timeout
- OpenRouter API errors
- Network failures
- Invalid model configuration

---

## Logging Gaps

### What IS Logged

1. ✅ Extraction attempt: `[Gmail Sync User] Extracted ${count} entities from email ${id}`
2. ✅ Graph save: `[Gmail Sync User] Saved ${count} entities to graph`
3. ✅ JSON parsing failures: `[Extraction] No JSON found in response`
4. ✅ Invalid structure: `[Extraction] Invalid response structure`

### What IS NOT Logged

1. ❌ Confidence threshold filtering (how many entities filtered)
2. ❌ Entity validation failures (which fields missing)
3. ❌ AI response content when entities = 0
4. ❌ Prompt sent to AI model
5. ❌ Empty email body detection
6. ❌ Distinction between "AI returned 0" vs "filtered to 0"

---

## Investigation Checklist

To diagnose why 1 email = 0 entities, check logs for:

### Step 1: Check AI Response
- [ ] Look for: `[Extraction] No JSON found in response`
- [ ] Look for: `[Extraction] Invalid response structure`
- [ ] Look for: `[Extraction] JSON parsing failed`

### Step 2: Check Extraction Attempt
- [ ] Look for: `[Gmail Sync User] Extracted N entities from email X`
- [ ] If N > 0 but saved = 0: confidence filtering issue
- [ ] If N = 0: check AI response or empty email

### Step 3: Check Email Content
- [ ] Verify email has body text (not just metadata)
- [ ] Check if email is HTML-only
- [ ] Verify email isn't spam/promotional

### Step 4: Check AI Call
- [ ] Look for: `[AI] Estimated cost` log
- [ ] Look for: `[AI] Actual cost` log
- [ ] Verify AI call succeeded (no timeout/error)

---

## Specific Code Locations Requiring Fixes

### Fix #1: Add Entity Filtering Visibility

**File**: `src/lib/extraction/entity-extractor.ts`
**Line**: 65-67

```typescript
// BEFORE
const filteredEntities = parsed.entities.filter(
  (entity) => entity.confidence >= this.config.minConfidence
);

// AFTER
const filteredEntities = parsed.entities.filter(
  (entity) => entity.confidence >= this.config.minConfidence
);

// Log filtered count
if (parsed.entities.length > filteredEntities.length) {
  const filteredCount = parsed.entities.length - filteredEntities.length;
  console.warn(
    `${LOG_PREFIX} Filtered ${filteredCount}/${parsed.entities.length} entities below confidence threshold ${this.config.minConfidence}`
  );
}
```

---

### Fix #2: Add Entity Validation Logging

**File**: `src/lib/extraction/entity-extractor.ts`
**Line**: 374-382

```typescript
// BEFORE
const validEntities = parsed.entities.filter((entity: any) => {
  return (
    entity.type &&
    entity.value &&
    entity.normalized &&
    typeof entity.confidence === 'number' &&
    entity.source
  );
});

// AFTER
const validEntities = parsed.entities.filter((entity: any) => {
  const isValid = (
    entity.type &&
    entity.value &&
    entity.normalized &&
    typeof entity.confidence === 'number' &&
    entity.source
  );

  if (!isValid) {
    console.warn(`${LOG_PREFIX} Invalid entity dropped:`, {
      type: entity.type,
      value: entity.value,
      hasNormalized: !!entity.normalized,
      hasConfidence: typeof entity.confidence === 'number',
      hasSource: !!entity.source,
    });
  }

  return isValid;
});

if (parsed.entities.length > validEntities.length) {
  const invalidCount = parsed.entities.length - validEntities.length;
  console.warn(
    `${LOG_PREFIX} Dropped ${invalidCount}/${parsed.entities.length} invalid entities (missing required fields)`
  );
}
```

---

### Fix #3: Log AI Response When Zero Entities

**File**: `src/lib/extraction/entity-extractor.ts`
**Line**: 62-76

```typescript
// Parse JSON response
const parsed = this.parseExtractionResponse(response.content);

// Filter entities by confidence threshold
const filteredEntities = parsed.entities.filter(
  (entity) => entity.confidence >= this.config.minConfidence
);

// ADD: Log when zero entities extracted
if (filteredEntities.length === 0) {
  console.warn(`${LOG_PREFIX} Zero entities extracted for email ${email.id}`);
  console.warn(`${LOG_PREFIX} AI raw response (first 500 chars):`, response.content.substring(0, 500));
  console.warn(`${LOG_PREFIX} Parsed entities before filtering:`, parsed.entities.length);
  console.warn(`${LOG_PREFIX} Email subject:`, email.subject);
  console.warn(`${LOG_PREFIX} Email body length:`, email.body.length);
}

return {
  emailId: email.id,
  entities: filteredEntities,
  spam: parsed.spam,
  extractedAt: new Date(),
  cost: response.usage.cost,
  model: response.model,
};
```

---

### Fix #4: Add Email Body Content Validation

**File**: `src/app/api/gmail/sync-user/route.ts`
**Line**: 290-346

```typescript
// BEFORE extraction
const email: Email = {
  id: message.id,
  subject,
  body,
  // ... rest of fields
};

// ADD: Validate email has extractable content
if (!body || body.trim().length === 0) {
  console.warn(
    `[Gmail Sync User] Skipping email ${message.id} - empty body (subject: "${subject}")`
  );
  totalProcessed++;
  continue; // Skip this email
}

// Proceed with extraction
const extractor = getEntityExtractor();
const extractionResult = await extractor.extractFromEmail(email);
```

---

### Fix #5: Improve Error Context in Exception Handler

**File**: `src/lib/extraction/entity-extractor.ts`
**Line**: 77-88

```typescript
catch (error) {
  // Enhanced error logging
  console.error(`${LOG_PREFIX} Failed to extract from email ${email.id}:`, error);
  console.error(`${LOG_PREFIX} Error type:`, error instanceof Error ? error.constructor.name : typeof error);
  console.error(`${LOG_PREFIX} Email subject:`, email.subject);
  console.error(`${LOG_PREFIX} Email body length:`, email.body?.length || 0);

  // Return empty result on error
  return {
    emailId: email.id,
    entities: [],
    spam: { isSpam: false, spamScore: 0 },
    extractedAt: new Date(),
    cost: 0,
    model: MODELS.CLASSIFIER,
  };
}
```

---

## Configuration Analysis

### Current Extraction Config

**File**: `src/lib/extraction/types.ts:101-107`

```typescript
export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  minConfidence: 0.7,           // ⚠️ May be too strict
  extractFromMetadata: true,
  extractFromSubject: true,
  extractFromBody: true,
  normalizeEntities: true,
};
```

**Potential Issues**:
1. **minConfidence: 0.7** - 70% threshold may filter too many valid entities
2. All extraction sources enabled - good
3. No fallback mechanism if one source fails

**Recommendation**: Add configurable confidence threshold:
```typescript
// Lower threshold for initial testing
const extractor = getEntityExtractor({ minConfidence: 0.5 });
```

---

## Prompt Analysis

### Current Prompt Strictness

**File**: `src/lib/extraction/prompts.ts:33-87`

**Strict Rules That May Reduce Extractions**:

1. **Person extraction restricted to metadata only**:
   ```
   ONLY from To/CC/From headers - NOT from email body text
   ```

2. **Company vs Person disambiguation**:
   ```
   When in doubt between person/company, choose company
   ```

3. **Email addresses excluded**:
   ```
   Email addresses are NOT person names
   ```

**Impact**: For sent emails with only recipient metadata:
- No persons extracted from body text
- Only recipients in To/CC fields extracted
- Support emails classified as companies

**Example Scenario**:
```
Email: "Hi, I spoke with John Doe from Acme Corp about the project"
From: user@example.com
To: support@acme.com

Extraction Result:
- company: Acme Corp (from body)
- person: NONE (John Doe in body text, not metadata)
```

---

## Recommended Investigation Steps

### 1. Enable Debug Logging

Add temporary debug logging to capture full extraction context:

```typescript
// In entity-extractor.ts::extractFromEmail()
console.log('[DEBUG] Full extraction context:', {
  emailId: email.id,
  subject: email.subject,
  bodyLength: email.body.length,
  bodyPreview: email.body.substring(0, 200),
  from: email.from,
  to: email.to,
  config: this.config,
});
```

### 2. Test With Sample Email

Create test email with known entities:

```typescript
const testEmail: Email = {
  id: 'test-123',
  subject: 'Meeting with John Doe from Acme Corp',
  body: 'Let\'s discuss the Q1 project timeline.',
  from: { name: 'Alice Smith', email: 'alice@example.com' },
  to: [{ name: 'Bob Jones', email: 'bob@acme.com' }],
  // ... rest
};

const result = await extractor.extractFromEmail(testEmail);
console.log('Test extraction result:', result);
```

### 3. Capture AI Raw Response

Add response capture for debugging:

```typescript
// In entity-extractor.ts after AI call
const response = await this.client.chat(...);

// Log full response for debugging
console.log('[DEBUG] AI raw response:', response.content);
console.log('[DEBUG] Response length:', response.content.length);

const parsed = this.parseExtractionResponse(response.content);
```

### 4. Lower Confidence Threshold Temporarily

Test with lower threshold to see if confidence filtering is the issue:

```typescript
// In sync-user route
const extractor = getEntityExtractor({ minConfidence: 0.3 }); // Lower threshold
```

---

## Summary of Failure Scenarios

| Scenario | Symptom | Location | Fix Priority |
|----------|---------|----------|--------------|
| AI returns invalid JSON | 0 entities, warning log | `parseExtractionResponse:354` | HIGH |
| AI returns empty entities array | 0 entities, no warning | `extractFromEmail:62` | HIGH |
| Entities below confidence threshold | 0 entities, no log | `extractFromEmail:65-67` | MEDIUM |
| Missing required entity fields | 0 entities, no log | `parseExtractionResponse:374` | MEDIUM |
| Empty email body | 0 entities, no warning | `sync-user:276-288` | LOW |
| AI client exception | 0 entities, error log | `extractFromEmail:77-88` | HIGH |
| Person in body text (not metadata) | 0 person entities | `prompts.ts:35` | LOW (design) |

---

## Next Steps

### Immediate Actions
1. ✅ **Add logging** for confidence filtering (Fix #1)
2. ✅ **Add logging** for entity validation failures (Fix #2)
3. ✅ **Log AI response** when zero entities extracted (Fix #3)
4. ⚠️ **Test with sample email** to reproduce issue

### Medium-Term Improvements
5. Add empty body validation before extraction (Fix #4)
6. Improve error context in exception handler (Fix #5)
7. Add configurable confidence thresholds per entity type
8. Add metrics tracking for extraction success rates

### Long-Term Enhancements
9. Add entity extraction debugging dashboard
10. Implement A/B testing for prompt variations
11. Add fallback extraction strategies (rule-based)
12. Track AI model response quality over time

---

## Conclusion

The "1 email processed, 0 entities extracted" issue is caused by **multiple silent failure points** in the extraction pipeline. The most likely root causes are:

1. **AI response parsing failures** (highest probability)
2. **Confidence threshold filtering** (medium probability)
3. **Entity validation failures** (medium probability)

All three failure modes are **logged but not surfaced to the user**, creating the appearance of success despite no entities being extracted.

**Recommended immediate action**: Apply Fixes #1, #2, and #3 to improve logging visibility, then test with a known email to capture the actual failure point.
