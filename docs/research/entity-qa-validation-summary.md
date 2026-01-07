# Entity QA/Validation - Quick Reference

## TL;DR

Add async validation layer after entity extraction to:
- Fix person/company confusion (90%+ accuracy)
- Filter generic/low-quality entities (30-50% reduction)
- Merge duplicates across emails
- Cost increase: only 15-20% with batch processing

## Architecture

```
Email → Extract (Mistral) → Validate (Mistral Batch) → Graph
         $0.0002/email      +$0.00003/email (async)
```

## Key Files to Create

```
src/lib/extraction/
├── entity-validator.ts          # Main validation logic
├── validation-prompts.ts        # Validation prompt templates
├── validation-types.ts          # TypeScript types
└── deduplication.ts             # Entity merging logic

src/lib/events/functions/
└── validate-entities.ts         # Inngest async handler
```

## Validation Logic

```typescript
// Input: Extracted entities + original email
{
  entities: [
    { type: "person", value: "support@flume.com" }, // ❌ Email as name
    { type: "person", value: "Bob" },               // ⚠️ Partial name
    { type: "company", value: "Flume Support" }     // ✅ Correct
  ]
}

// Output: Validated, corrected, rejected
{
  validated: [
    { type: "person", value: "Bob Matsuoka", confidence: 0.95 }
  ],
  corrected: [
    { type: "company", value: "Flume", reason: "support@flume.com → company" }
  ],
  rejected: [
    { value: "support@flume.com", reason: "Email address, not person name" }
  ],
  duplicates: [
    { merge: ["Bob", "Bob Matsuoka"] → "Bob Matsuoka" }
  ]
}
```

## Cost Comparison

| Approach | Cost/Email | Quality | Latency |
|----------|-----------|---------|---------|
| **Baseline** (no validation) | $0.0002 | Low | 0ms |
| **Single validation** | $0.00035 | High | +300ms |
| **Batch validation** ⭐ | $0.00023 | High | +2s async |

**Recommended:** Batch validation (5 emails/batch, async)

## Implementation Timeline

- **Week 1:** Core validator + prompts
- **Week 2:** Deduplication logic
- **Week 3:** Batch processing optimization
- **Week 4:** Inngest integration + deployment
- **Week 5:** Monitoring + tuning

**Total:** 5 weeks to production

## Success Metrics

✅ **Quality:** 90%+ type accuracy (vs 70% today)
✅ **Cost:** <20% increase
✅ **Performance:** <500ms validation latency
✅ **False Positives:** <10% (vs 30% today)

## Quick Start

1. Read full design: `entity-qa-validation-design-2026-01-07.md`
2. Start with Phase 1: Core validation
3. Test on 20 sample emails
4. Measure accuracy and cost
5. Iterate and deploy

## Questions?

See full document for:
- Detailed prompt templates
- Error handling strategies
- Batch processing optimization
- Monitoring dashboards
- Migration strategy
