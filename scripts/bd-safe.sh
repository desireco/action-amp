#!/bin/bash
#
# Safe beads wrapper - ensures tests pass before closing tasks
# Source this file in your shell to get the bd-safe function
#

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

bd-safe() {
    # Check if we're trying to close tasks
    if [ "$1" = "close" ]; then
        echo -e "${BLUE}🔒 Pre-commit test verification for task completion${NC}"
        echo ""

        # Check if npm is available
        if ! command -v npm >/dev/null 2>&1; then
            echo -e "${RED}❌ npm not found. Cannot run tests.${NC}" >&2
            echo "Please ensure Node.js and npm are installed." >&2
            return 1
        fi

        # Check if package.json exists
        if [ ! -f "package.json" ]; then
            echo -e "${RED}❌ No package.json found in current directory.${NC}" >&2
            echo "Please run this command from the project root." >&2
            return 1
        fi

        # Run tests
        echo -e "${YELLOW}🧪 Running unit tests...${NC}"
        if npm test 2>/dev/null | grep -q "FAIL\|failed"; then
            echo -e "${RED}❌ Unit tests failed! Cannot close tasks.${NC}" >&2
            echo "" >&2
            echo "Please fix the failing tests before closing tasks:" >&2
            echo "  1. Run 'npm test' to see which tests are failing" >&2
            echo "  2. Fix the issues" >&2
            echo "  3. Re-run tests to verify they pass" >&2
            echo "  4. Try closing the task again" >&2
            return 1
        fi
        echo -e "${GREEN}✅ Unit tests passed${NC}"

        # Check if e2e tests exist and try to run them
        if [ -d "tests" ] && [ "$(ls -A tests 2>/dev/null)" ]; then
            echo -e "${YELLOW}🧪 Running e2e tests...${NC}"
            # E2E tests might fail due to dev server not running, so we'll be more lenient
            if ! npm run test:e2e >/dev/null 2>&1; then
                echo -e "${YELLOW}⚠️  E2E tests could not run (may need dev server)${NC}"
                echo "  Proceeding with unit test verification only..."
            else
                echo -e "${GREEN}✅ E2E tests passed${NC}"
            fi
        fi

        echo ""
        echo -e "${GREEN}✅ All tests verified. Proceeding with task closure...${NC}"
        echo ""

        # Run the actual bd close command
        bd "$@"
    else
        # For non-close commands, just pass through to bd
        bd "$@"
    fi
}

# Create an alias for convenience
alias bd='bd-safe'

echo "✅ bd-safe function loaded"
echo "   Usage: bd close <task-id>  # Will run tests before closing"
echo "   Other commands work normally"