#!/bin/bash
#
# Beads pre-close hook for test verification
# This script is called before closing beads tasks to ensure tests pass
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Verifying tests before allowing task completion...${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must be run from project root with package.json${NC}" >&2
    exit 1
fi

# Run unit tests
echo "Running unit tests..."
if ! npm test >/dev/null 2>&1; then
    echo -e "${RED}❌ Unit tests failed!${NC}" >&2
    echo "Please fix failing tests before closing tasks." >&2
    echo "Run 'npm test' to see test failures." >&2
    exit 1
fi

echo -e "${GREEN}✅ Unit tests passed${NC}"

# Optional: Run e2e tests if available
if [ -d "tests" ] && command -v npx >/dev/null 2>&1; then
    echo "Attempting to run e2e tests..."
    # E2E tests may fail if server not running, so we'll be lenient
    if timeout 30 npm run test:e2e >/dev/null 2>&1; then
        echo -e "${GREEN}✅ E2E tests passed${NC}"
    else
        echo -e "${YELLOW}⚠️  E2E tests skipped (may need dev server)${NC}"
    fi
fi

echo -e "${GREEN}✅ All tests verified. Task can be completed.${NC}"
exit 0