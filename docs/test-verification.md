# Test Verification for Task Completion

This document explains the test verification system that ensures all tests pass before allowing tasks to be marked as complete in beads.

## Overview

The test verification system prevents closing tasks with failing tests, ensuring code quality and stability. This is implemented through a wrapper script that intercepts beads commands and runs tests before allowing task completion.

## How It Works

### Method 1: Using the Wrapper Script (Recommended)

1. The `bin/bd` script wraps the real beads command
2. When you run `bd close <task-id>`, it automatically:
   - Runs unit tests (`npm test`)
   - Attempts to run e2e tests if available
   - Only allows the close operation if tests pass
3. If tests fail, it shows the error and prevents the operation

### Method 2: Manual Verification

Before closing tasks, manually run:
```bash
npm test          # Run unit tests
npm run test:e2e  # Run e2e tests (if available)
```

### Method 3: Using the Pre-close Hook

The `.beads/pre-close-hook.sh` script can be called manually:
```bash
./.beads/pre-close-hook.sh
```

## Installation

### Option A: Use the Local Wrapper (Easiest)

Add the bin directory to your PATH:
```bash
export PATH="$(pwd)/bin:$PATH"
```

Or create an alias in your shell profile:
```bash
alias bd='$(pwd)/bin/bd'
```

### Option B: System-wide Installation

```bash
# Copy the wrapper to a location in your PATH
sudo cp bin/bd /usr/local/bin/bd-safe
# Then use bd-safe instead of bd
```

## Configuration

### Skipping Tests (Not Recommended)

If you absolutely must skip tests (emergency only):
```bash
# Use the real bd command directly
/usr/local/go/bin/bd close <task-id>

# Or set an environment variable
SKIP_TESTS=1 bd close <task-id>
```

### Test Timeout

E2E tests have a 60-second timeout to prevent hanging. Adjust this in `bin/bd` if needed.

## Troubleshooting

### Tests Fail but You Think They Shouldn't

1. Check test output:
   ```bash
   npm test
   ```

2. Check if tests are up to date:
   ```bash
   npm install
   ```

3. For e2e test failures:
   - Ensure dev server is running: `npm run dev`
   - Check test data setup
   - Verify browser dependencies

### Wrapper Script Not Working

1. Ensure it's executable:
   ```bash
   chmod +x bin/bd
   ```

2. Check the real bd command is in PATH:
   ```bash
   which bd
   ```

3. Verify PATH order:
   ```bash
   echo $PATH | tr ':' '\n' | head
   ```

## Development

### Adding New Test Types

Edit `bin/bd` and add your test command to the `verify_tests()` function.

### Modifying Behavior

The wrapper script can be customized to:
- Run additional linters (`npm run lint`, `npm run type-check`)
- Check code coverage
- Run build verification (`npm run build`)

## Why This Matters

1. **Prevents broken code**: Tasks can't be marked complete with failing tests
2. **Ensures quality**: All code changes must pass verification
3. **Reduces bugs**: Catches issues before they reach production
4. **Team discipline**: Enforces testing standards across the team