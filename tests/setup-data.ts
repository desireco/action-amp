import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Sets up test data for e2e tests
 * This creates a minimal set of data required for tests to run
 */
async function setupTestData() {
  const dataDir = path.join(process.cwd(), 'data');

  // Ensure data directory exists
  await fs.mkdir(dataDir, { recursive: true });

  // Create areas directory and test area
  const areasDir = path.join(dataDir, 'areas');
  await fs.mkdir(areasDir, { recursive: true });

  const testAreaDir = path.join(areasDir, 'test-area');
  await fs.mkdir(testAreaDir, { recursive: true });

  // Create area.toml
  const areaToml = `name = "Test Area"
description = "Area for testing"
priority = "medium"
active = true
created = "2024-01-01"
icon = "test"
color = "blue"
`;
  await fs.writeFile(path.join(testAreaDir, 'area.toml'), areaToml);

  // Create project directory and test project
  const testProjectDir = path.join(testAreaDir, 'test-project');
  await fs.mkdir(testProjectDir, { recursive: true });

  // Create project.toml
  const projectToml = `name = "Test Project"
area = "test-area"
status = "active"
priority = "medium"
created = "2024-01-01"
description = "A test project"
`;
  await fs.writeFile(path.join(testProjectDir, 'project.toml'), projectToml);

  // Create a test action
  const actionMd = `---
id: "test-action"
title: "Test Action"
status: "todo"
priority: "medium"
created: "2024-01-01"
---

This is a test action
`;
  await fs.writeFile(path.join(testProjectDir, 'act-test.md'), actionMd);

  // Create inbox directory and test items
  const inboxDir = path.join(dataDir, 'inbox');
  await fs.mkdir(inboxDir, { recursive: true });

  const inboxItemMd = `---
type: "action"
title: "Test Inbox Item"
captured: "2024-01-01T00:00:00.000Z"
---

This is a test inbox item
`;
  await fs.writeFile(path.join(inboxDir, 'test-inbox.md'), inboxItemMd);

  // Create reviews directory and test review
  const reviewsDir = path.join(dataDir, 'reviews', 'daily');
  await fs.mkdir(reviewsDir, { recursive: true });

  // Use a fixed date for test review (not today's date to avoid cleanup)
  const reviewMd = `---
type: daily
date: 2024-01-01
---

# Test Daily Review

## Reflection
- Test went well

## Tomorrow's Focus
- More testing

---
Test content for save
`;
  await fs.writeFile(path.join(reviewsDir, '2024-01-01.md'), reviewMd);

  console.log('Test data setup completed');
}

// Run setup
setupTestData().catch(console.error);