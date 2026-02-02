#!/bin/bash

# Check if pnpm-lock.yaml is in sync with package.json
# Used by pre-push hook and CI to prevent deployment failures
#
# Vercel uses --frozen-lockfile which fails if lockfile is out of sync

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ ! -f "pnpm-lock.yaml" ] || [ ! -f "package.json" ]; then
  echo "Skipping lockfile check - pnpm-lock.yaml or package.json not found"
  exit 0
fi

echo "Checking pnpm-lock.yaml sync..."

# Run pnpm install --lockfile-only to update lockfile without installing
# Then check if there are any changes
pnpm install --lockfile-only --ignore-scripts 2>/dev/null

if [[ -n $(git diff --name-only pnpm-lock.yaml 2>/dev/null) ]]; then
  echo -e "${RED}Error: pnpm-lock.yaml is out of sync with package.json${NC}"
  echo ""
  echo "This will cause Vercel deployments to fail (--frozen-lockfile)."
  echo ""
  echo "To fix, run:"
  echo "  pnpm install"
  echo "  git add pnpm-lock.yaml"
  echo "  git commit -m 'fix: sync pnpm-lock.yaml with package.json'"
  echo ""

  # Restore original lockfile
  git checkout pnpm-lock.yaml 2>/dev/null
  exit 1
fi

echo -e "${GREEN}pnpm-lock.yaml is in sync${NC}"
exit 0
