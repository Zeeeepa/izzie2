# Research Agent Serialization - Verification Index

**Quick Links to All Verification Resources**

---

## 📋 Overview Documents

### [VERIFICATION-RESULTS.md](./VERIFICATION-RESULTS.md)
**Complete verification report with results and evidence**
- Static verification results (✅ ALL PASSED)
- Expected behavior for all scenarios
- Success criteria and failure indicators
- Evidence requirements for runtime testing
- Rollback plan if issues found

### [QUICK-TEST-GUIDE.md](./QUICK-TEST-GUIDE.md)
**30-second overview and quick test procedures**
- Quick start commands
- 3 main tests (2-5 minutes each)
- Common issues and fixes
- Quick check queries

### [test-research-serialization.md](./test-research-serialization.md)
**Comprehensive test plan and detailed scenarios**
- Test Scenario 1: Single Research Task
- Test Scenario 2: Serial Execution (Critical)
- Test Scenario 3: Status Progression
- Verification commands and manual testing procedure
- Expected evidence of success

---

## 🔧 Verification Scripts

### [scripts/verify-research-serialization.sh](./scripts/verify-research-serialization.sh)
**Automated static code verification**

**Usage:**
```bash
./scripts/verify-research-serialization.sh
```

**Checks:**
- Concurrency configuration (limit: 1, key: userId)
- Initialization step (Step 0 at 0%)
- Initial feedback message
- Inngest event registration
- Database schema fields
- Architecture documentation

**Status:** ✅ ALL 6 CHECKS PASSING

### [scripts/verify-research-db.sql](./scripts/verify-research-db.sql)
**Database verification queries (10 queries)**

**Usage:**
```bash
# Run all queries
psql $DATABASE_URL -f scripts/verify-research-db.sql

# Run individual query
psql $DATABASE_URL -c "<paste query here>"

# Continuous monitoring
watch -n 5 'psql $DATABASE_URL -c "SELECT id, status, progress FROM agent_tasks WHERE agent_type = '\''research'\'' ORDER BY created_at DESC LIMIT 5;"'
```

**Queries:**
1. Recent research tasks (last 10)
2. Verify serial execution (NO OVERLAP) ← **CRITICAL**
3. Check initialization step (Step 0 at 0%)
4. Check for stuck tasks (pending > 30s)
5. Task status distribution
6. Progress update frequency
7. Verify concurrency enforcement (per-user)
8. Task execution timeline (visual)
9. Check for failed initialization
10. Performance summary (last 24 hours)

---

## 📖 Architecture Documentation

### [docs/research/research-agent-architecture-2026-02-09.md](./docs/research/research-agent-architecture-2026-02-09.md)
**Complete architecture documentation**
- Multi-source research architecture
- Concurrency control (lines 84-90)
- Step-by-step research flow
- Progress tracking design
- Cost and performance optimization

---

## 💻 Source Code (Changed Files)

### [src/lib/events/functions/research-task.ts](./src/lib/events/functions/research-task.ts)
**Inngest function with concurrency control**

**Key changes (lines 39-42):**
```typescript
concurrency: {
  limit: 1, // Only one research task at a time
  key: 'event.data.userId', // Per-user serialization
},
```

### [src/agents/research/research-agent.ts](./src/agents/research/research-agent.ts)
**Research agent with initialization step**

**Key changes (lines 59-63):**
```typescript
// Step 0: Initialize research (0% progress)
await context.updateProgress({
  progress: 0,
  currentStep: 'Initializing research agent',
});
```

### [src/lib/chat/tools/research.ts](./src/lib/chat/tools/research.ts)
**Research tool with initial feedback**

**Key changes (lines 95-99):**
```typescript
onProgress?.({
  step: 'Initializing research agent...',
  progress: 0,
  status: 'starting',
});
```

---

## 🧪 Testing Workflow

### Quick Test (10 minutes)

```bash
# 1. Static verification
./scripts/verify-research-serialization.sh

# 2. Start servers
pnpm dev                           # Terminal 1
npx inngest-cli@latest dev         # Terminal 2

# 3. Run manual tests (see QUICK-TEST-GUIDE.md)
# - Test 1: Single task (2 min)
# - Test 2: Serial execution (5 min)
# - Test 3: Progress monitoring

# 4. Database verification
psql $DATABASE_URL -f scripts/verify-research-db.sql > results.txt

# 5. Review critical queries
grep -A 10 "Query 2" results.txt  # No overlap check
grep -A 10 "Query 3" results.txt  # Initialization check
grep -A 10 "Query 4" results.txt  # Stuck tasks check
```

---

## 📊 Verification Checklist

### Static Verification (Automated)
- [x] Concurrency limit set to 1
- [x] Concurrency key set to userId
- [x] Initialization step implemented
- [x] Initial feedback message added
- [x] Inngest event registered
- [x] Database schema correct
- [x] Architecture documentation updated

### Runtime Verification (Manual - Pending)
- [ ] Single task completes 0% → 100%
- [ ] Two tasks execute serially (no overlap)
- [ ] No tasks stuck at "0% pending"
- [ ] Progress updates within 2 seconds
- [ ] Database timestamps confirm serialization
- [ ] Inngest dashboard shows concurrency enforcement

### Evidence Collection (Pending)
- [ ] Inngest dashboard screenshot (queue enforcement)
- [ ] Database Query 2 output (gap_seconds >= 0)
- [ ] Database Query 3 output (initialization at 0%)
- [ ] Database Query 4 output (no stuck tasks)
- [ ] Task timing spreadsheet (Task2.start > Task1.end)

---

## 🚀 Next Actions

### Immediate (Today)
1. **Run static verification** ✅ DONE
   ```bash
   ./scripts/verify-research-serialization.sh
   ```

2. **Execute runtime tests** ⏳ PENDING
   - Follow QUICK-TEST-GUIDE.md
   - Document results with screenshots
   - Run database verification queries

3. **Collect evidence** ⏳ PENDING
   - Inngest dashboard screenshots
   - Database query outputs
   - Timestamp analysis

### Follow-up (This Week)
4. **Review results**
   - Verify all success criteria met
   - Document any issues found
   - Update VERIFICATION-RESULTS.md

5. **Production deployment** (if tests pass)
   - Deploy to staging first
   - Monitor for 24 hours
   - Deploy to production

6. **Post-deployment monitoring**
   - Set up alerts (stuck tasks, high failure rate)
   - Dashboard for research task metrics
   - Weekly performance review

---

## 📞 Support

### Common Questions

**Q: How do I run the static verification?**
```bash
./scripts/verify-research-serialization.sh
```

**Q: How do I check if tasks are overlapping?**
```sql
-- Database Query 2 (see scripts/verify-research-db.sql)
-- Look for negative gap_seconds values
```

**Q: How do I monitor progress in real-time?**
```bash
watch -n 1 "psql $DATABASE_URL -c \"SELECT id, status, progress, current_step FROM agent_tasks WHERE agent_type = 'research' ORDER BY created_at DESC LIMIT 1;\""
```

**Q: What if a task is stuck at 0% pending?**
1. Check if Inngest dev server is running
2. Check Inngest dashboard for events
3. Restart Inngest: `npx inngest-cli@latest dev`
4. See QUICK-TEST-GUIDE.md "Common Issues"

**Q: How do I verify serialization is working?**
- Inngest dashboard shows Task #2 "Queued" while Task #1 runs
- Database Query 2 shows gap_seconds >= 0 (no negative values)
- Task #2 started_at > Task #1 completed_at

---

## 📚 Related Documentation

- [Research Agent Architecture](./docs/research/research-agent-architecture-2026-02-09.md)
- [Agent Framework Design](./docs/agents/agent-framework.md) *(if exists)*
- [Inngest Integration Guide](./docs/inngest/integration.md) *(if exists)*
- [Database Schema](./src/lib/db/schema.ts) (lines 730-850)

---

## 📝 Version History

- **2026-02-09:** Initial verification setup
  - Added concurrency control
  - Added initialization step
  - Added initial feedback message
  - Created verification scripts and documentation

---

**Last Updated:** 2026-02-09
**Status:** Static verification complete, runtime verification pending
**Next Step:** Execute manual tests following QUICK-TEST-GUIDE.md
