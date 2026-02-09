#!/bin/bash

# Research Agent Serialization Verification Script
# Verifies that the serialization fix is properly implemented

set -e

echo "=================================================="
echo "Research Agent Serialization Fix - Verification"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Verify concurrency configuration
echo "Check 1: Verifying concurrency configuration..."
if grep -A 3 "concurrency:" src/lib/events/functions/research-task.ts | grep -q "limit: 1"; then
    echo -e "${GREEN}✓ Concurrency limit set to 1${NC}"
else
    echo -e "${RED}✗ Concurrency limit NOT set to 1${NC}"
    exit 1
fi

if grep -A 3 "concurrency:" src/lib/events/functions/research-task.ts | grep -q "key: 'event.data.userId'"; then
    echo -e "${GREEN}✓ Concurrency key set to userId${NC}"
else
    echo -e "${RED}✗ Concurrency key NOT set to userId${NC}"
    exit 1
fi

echo ""

# Check 2: Verify initialization step
echo "Check 2: Verifying initialization step (Step 0)..."
if grep -A 3 "Step 0: Initialize" src/agents/research/research-agent.ts | grep -q "progress: 0"; then
    echo -e "${GREEN}✓ Step 0 initialization implemented (progress: 0)${NC}"
else
    echo -e "${RED}✗ Step 0 initialization NOT found${NC}"
    exit 1
fi

if grep -A 3 "Step 0: Initialize" src/agents/research/research-agent.ts | grep -q "Initializing research agent"; then
    echo -e "${GREEN}✓ Initialization message set correctly${NC}"
else
    echo -e "${RED}✗ Initialization message NOT set${NC}"
    exit 1
fi

echo ""

# Check 3: Verify initial feedback message
echo "Check 3: Verifying initial feedback message..."
if grep -B 2 -A 4 "onProgress?.({" src/lib/chat/tools/research.ts | grep -q "Initializing research agent"; then
    echo -e "${GREEN}✓ Initial feedback message implemented${NC}"
else
    echo -e "${RED}✗ Initial feedback message NOT found${NC}"
    exit 1
fi

if grep -B 2 -A 4 "onProgress?.({" src/lib/chat/tools/research.ts | grep -q "progress: 0"; then
    echo -e "${GREEN}✓ Initial progress set to 0${NC}"
else
    echo -e "${RED}✗ Initial progress NOT set to 0${NC}"
    exit 1
fi

echo ""

# Check 4: Verify Inngest event registration
echo "Check 4: Verifying Inngest event registration..."
if grep -q "{ event: 'izzie/research.request' }" src/lib/events/functions/research-task.ts; then
    echo -e "${GREEN}✓ Inngest event trigger registered${NC}"
else
    echo -e "${RED}✗ Inngest event trigger NOT registered${NC}"
    exit 1
fi

echo ""

# Check 5: Database schema verification
echo "Check 5: Verifying database schema..."
if grep -A 20 "'agent_tasks'" src/lib/db/schema.ts | grep -q "status.*pending"; then
    echo -e "${GREEN}✓ agent_tasks table has status field${NC}"
else
    echo -e "${RED}✗ agent_tasks status field NOT found${NC}"
    exit 1
fi

if grep -A 20 "'agent_tasks'" src/lib/db/schema.ts | grep -q "progress.*integer"; then
    echo -e "${GREEN}✓ agent_tasks table has progress field${NC}"
else
    echo -e "${RED}✗ agent_tasks progress field NOT found${NC}"
    exit 1
fi

if grep -A 20 "'agent_tasks'" src/lib/db/schema.ts | grep -q "current_step"; then
    echo -e "${GREEN}✓ agent_tasks table has current_step field${NC}"
else
    echo -e "${RED}✗ agent_tasks current_step field NOT found${NC}"
    exit 1
fi

echo ""

# Check 6: Verify architecture documentation updated
echo "Check 6: Verifying architecture documentation..."
if [ -f "docs/research/research-agent-architecture-2026-02-09.md" ]; then
    if grep -q "Concurrency" docs/research/research-agent-architecture-2026-02-09.md; then
        echo -e "${GREEN}✓ Architecture documentation includes concurrency section${NC}"
    else
        echo -e "${YELLOW}⚠ Architecture documentation exists but missing concurrency section${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Architecture documentation not found (expected path: docs/research/research-agent-architecture-2026-02-09.md)${NC}"
fi

echo ""

# Summary
echo "=================================================="
echo "Static Verification Complete"
echo "=================================================="
echo ""
echo -e "${GREEN}All static checks passed!${NC}"
echo ""
echo "Next Steps:"
echo "1. Start development servers:"
echo "   pnpm dev"
echo "   npx inngest-cli@latest dev"
echo ""
echo "2. Run manual tests as documented in:"
echo "   test-research-serialization.md"
echo ""
echo "3. Verify database state with queries:"
echo "   - Check task timing (no overlap)"
echo "   - Verify initialization step appears"
echo "   - Confirm serial execution"
echo ""
echo "4. Monitor Inngest dashboard:"
echo "   http://localhost:8288"
echo ""

exit 0
