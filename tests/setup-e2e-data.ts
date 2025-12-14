import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'child_process';

/**
 * Sets up test data for e2e tests
 */
async function setupE2EData() {
  const testDataDir = path.join(process.cwd(), 'test-data');
  const mainDataDir = path.join(process.cwd(), 'data');

  // Clean up any existing test data first
  try {
    await fs.rm(testDataDir, { recursive: true, force: true });
  } catch {}

  // Create test data directory
  await fs.mkdir(testDataDir, { recursive: true });

  // Create areas directory and test area
  const areasDir = path.join(testDataDir, 'areas');
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
description = "A test project for e2e testing"
due_date = "2024-12-31"
`;
  await fs.writeFile(path.join(testProjectDir, 'project.toml'), projectToml);

  // Create test actions with different statuses
  const actions = [
    {
      id: 'test-action-1',
      title: 'Test Action Todo',
      status: 'todo',
      priority: 'high',
      content: 'This is a test action with todo status'
    },
    {
      id: 'test-action-2',
      title: 'Test Action In Progress',
      status: 'in_progress',
      priority: 'medium',
      content: 'This is a test action with in_progress status'
    },
    {
      id: 'test-action-3',
      title: 'Completed Test Action',
      status: 'completed',
      priority: 'low',
      content: 'This is a completed test action',
      completed: 'completed: "2024-01-02"'
    }
  ];

  for (const action of actions) {
    const actionMd = `---
id: "${action.id}"
title: "${action.title}"
status: "${action.status}"
priority: "${action.priority}"
created: "2024-01-01"
${action.completed || ''}
---

${action.content}
`;
    await fs.writeFile(path.join(testProjectDir, `act-${action.id}.md`), actionMd);
  }

  // Create inbox directory and test items
  const inboxDir = path.join(testDataDir, 'inbox');
  await fs.mkdir(inboxDir, { recursive: true });

  const inboxItems = [
    {
      id: 'test-inbox-1',
      type: 'action',
      title: 'Test Inbox Action',
      content: 'This is a test inbox action item that needs processing'
    },
    {
      id: 'test-inbox-2',
      type: 'note',
      title: 'Test Inbox Note',
      content: 'This is a test inbox note item with reference information'
    },
    {
      id: 'test-inbox-3',
      type: 'idea',
      title: 'Test Inbox Idea',
      content: 'This is a test inbox idea for future consideration'
    }
  ];

  for (const item of inboxItems) {
    const inboxItemMd = `---
id: "${item.id}"
type: "${item.type}"
title: "${item.title}"
captured: "2024-01-01T00:00:00.000Z"
---

${item.content}
`;
    await fs.writeFile(path.join(inboxDir, `${item.id}.md`), inboxItemMd);
  }

  // Create reviews directory and test reviews
  const reviewsDir = path.join(testDataDir, 'reviews', 'daily');
  await fs.mkdir(reviewsDir, { recursive: true });

  // Create multiple test reviews
  const reviews = [
    {
      date: '2024-01-01',
      title: 'Daily Review - 2024-01-01',
      content: '## Reflection\n- First test day went well\n- All tests created\n\n## Tomorrow\n- Fix failing tests'
    },
    {
      date: '2024-01-02',
      title: 'Daily Review - 2024-01-02',
      content: '## Reflection\n- Fixed some tests\n- Identified strict mode issues\n\n## Tomorrow\n- Optimize test selectors'
    }
  ];

  for (const review of reviews) {
    const reviewMd = `---
type: daily
date: ${review.date}
---

# ${review.title}

${review.content}

Test content for save and edit functionality.
`;
    await fs.writeFile(path.join(reviewsDir, `${review.date}.md`), reviewMd);
  }

  // Copy test data to main data directory
  console.log('Copying test data to data directory...');
  await fs.mkdir(mainDataDir, { recursive: true });

  // Copy directories one by one
  const dirsToCopy = ['areas', 'inbox', 'reviews'];
  for (const dir of dirsToCopy) {
    const src = path.join(testDataDir, dir);
    const dest = path.join(mainDataDir, dir);

    // Remove existing directory
    await fs.rm(dest, { recursive: true, force: true }).catch(() => {});

    // Copy new directory
    execSync(`cp -r "${src}" "${dest}"`, { stdio: 'inherit' });
    console.log(`✓ Copied ${dir}`);
  }

  console.log('✅ E2E test data setup completed successfully!');
}

// Run setup
setupE2EData().catch(console.error);