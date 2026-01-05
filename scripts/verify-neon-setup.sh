#!/bin/bash
# Neon Postgres Setup Verification Script
# Run this to verify all files are in place before setting up Neon

echo "🔍 Verifying Neon Postgres implementation..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track status
ALL_GOOD=true

# Check function
check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${RED}✗${NC} $1 (MISSING)"
    ALL_GOOD=false
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1/"
  else
    echo -e "${RED}✗${NC} $1/ (MISSING)"
    ALL_GOOD=false
  fi
}

# Check configuration files
echo "Configuration Files:"
check_file "drizzle.config.ts"
check_file ".env.example"
echo ""

# Check database module
echo "Database Module (src/lib/db/):"
check_dir "src/lib/db"
check_file "src/lib/db/index.ts"
check_file "src/lib/db/client.ts"
check_file "src/lib/db/schema.ts"
check_file "src/lib/db/vectors.ts"
check_file "src/lib/db/README.md"
echo ""

# Check migrations
echo "Migrations (drizzle/):"
check_dir "drizzle"
check_file "drizzle/migrate.ts"
check_dir "drizzle/migrations"
check_file "drizzle/migrations/0000_initial.sql"
echo ""

# Check API test route
echo "API Test Route:"
check_dir "src/app/api/db/test"
check_file "src/app/api/db/test/route.ts"
echo ""

# Check documentation
echo "Documentation:"
check_file "docs/NEON_SETUP.md"
check_file "NEON_IMPLEMENTATION.md"
check_file "QUICK_START_NEON.md"
echo ""

# Check dependencies
echo "Dependencies (package.json):"
if grep -q "drizzle-orm" package.json; then
  echo -e "${GREEN}✓${NC} drizzle-orm"
else
  echo -e "${RED}✗${NC} drizzle-orm (MISSING)"
  ALL_GOOD=false
fi

if grep -q "@neondatabase/serverless" package.json; then
  echo -e "${GREEN}✓${NC} @neondatabase/serverless"
else
  echo -e "${RED}✗${NC} @neondatabase/serverless (MISSING)"
  ALL_GOOD=false
fi

if grep -q "drizzle-kit" package.json; then
  echo -e "${GREEN}✓${NC} drizzle-kit"
else
  echo -e "${RED}✗${NC} drizzle-kit (MISSING)"
  ALL_GOOD=false
fi

if grep -q "tsx" package.json; then
  echo -e "${GREEN}✓${NC} tsx"
else
  echo -e "${RED}✗${NC} tsx (MISSING)"
  ALL_GOOD=false
fi
echo ""

# Check npm scripts
echo "NPM Scripts:"
if grep -q "db:migrate" package.json; then
  echo -e "${GREEN}✓${NC} db:migrate"
else
  echo -e "${RED}✗${NC} db:migrate (MISSING)"
  ALL_GOOD=false
fi

if grep -q "db:generate" package.json; then
  echo -e "${GREEN}✓${NC} db:generate"
else
  echo -e "${RED}✗${NC} db:generate (MISSING)"
  ALL_GOOD=false
fi

if grep -q "db:studio" package.json; then
  echo -e "${GREEN}✓${NC} db:studio"
else
  echo -e "${RED}✗${NC} db:studio (MISSING)"
  ALL_GOOD=false
fi
echo ""

# Check TypeScript compilation
echo "TypeScript Compilation:"
if npm run type-check 2>&1 | grep -q "src/lib/db.*error"; then
  echo -e "${RED}✗${NC} Database module has TypeScript errors"
  ALL_GOOD=false
else
  echo -e "${GREEN}✓${NC} Database module compiles without errors"
fi
echo ""

# Final status
echo "════════════════════════════════════════"
if [ "$ALL_GOOD" = true ]; then
  echo -e "${GREEN}✅ All checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Create Neon project at https://console.neon.tech/"
  echo "2. Copy DATABASE_URL to .env"
  echo "3. Run: npm run db:migrate"
  echo "4. Test: curl http://localhost:3300/api/db/test"
  echo ""
  echo "See QUICK_START_NEON.md for detailed instructions"
else
  echo -e "${RED}❌ Some checks failed${NC}"
  echo "Please review the errors above"
  exit 1
fi
