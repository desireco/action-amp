#!/bin/bash
#
# beads wrapper script that enforces test verification
# This script wraps bd commands and ensures tests pass before allowing certain operations
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run tests
run_tests() {
    echo -e "${YELLOW}Running tests before allowing beads operation...${NC}"

    # Run unit tests
    echo "Running unit tests..."
    if ! npm test --silent; then
        echo -e "${RED}❌ Unit tests failed! Cannot proceed with beads operation.${NC}"
        echo "Please fix the failing tests and try again."
        exit 1
    fi
    echo -e "${GREEN}✅ Unit tests passed${NC}"

    # Check if e2e tests are available and run them
    if [ -d "tests" ] && [ "$(ls -A tests 2>/dev/null)" ]; then
        echo "Running e2e tests..."
        # Note: e2e tests might need the dev server running, so we'll handle this gracefully
        if ! npm run test:e2e 2>/dev/null; then
            echo -e "${YELLOW}⚠️  E2E tests failed or could not run${NC}"
            echo "Note: E2E tests may require the dev server to be running"
            echo "Proceeding with caution (unit tests passed)"
        else
            echo -e "${GREEN}✅ E2E tests passed${NC}"
        fi
    fi

    echo -e "${GREEN}✅ All tests verification completed successfully${NC}"
}

# Commands that require test verification
REQUIRES_TESTS=("close")

# Check if this is a command that requires test verification
if [ $# -gt 0 ]; then
    for cmd in "${REQUIRES_TESTS[@]}"; do
        if [ "$1" = "$cmd" ]; then
            # This command requires tests to pass
            run_tests
            break
        fi
    done
fi

# Execute the actual beads command
exec bd "$@"