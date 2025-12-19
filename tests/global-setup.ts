import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'child_process';

async function globalSetup(config: FullConfig) {
  // Set test environment variable
  process.env.TEST_MODE = 'true';

  // Create test data directory
  const testDataDir = path.join(process.cwd(), 'test-data');
  const mainDataDir = path.join(process.cwd(), 'data');

  // Ensure test-data directory exists
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
description = "A test project"
`;
  await fs.writeFile(path.join(testProjectDir, 'project.toml'), projectToml);

  // Create test actions
  const actions = [
    {
      id: 'test-action-1',
      title: 'Test Action 1',
      status: 'draft',
      priority: 'high',
      content: 'This is test action 1'
    },
    {
      id: 'test-action-2',
      title: 'Test Action 2',
      status: 'in_progress',
      priority: 'medium',
      content: 'This is test action 2'
    },
    {
      id: 'test-action-3',
      title: 'Completed Action',
      status: 'completed',
      priority: 'low',
      content: 'This is a completed action'
    }
  ];

  for (const action of actions) {
    const actionMd = `---
id: "${action.id}"
title: "${action.title}"
status: "${action.status}"
priority: "${action.priority}"
created: "2024-01-01"
${action.status === 'completed' ? 'completed: "2024-01-02"' : ''}
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
      type: 'action',
      title: 'Test Inbox Action',
      content: 'This is a test inbox action item'
    },
    {
      type: 'note',
      title: 'Test Inbox Note',
      content: 'This is a test inbox note item'
    },
    {
      type: 'idea',
      title: 'Test Inbox Idea',
      content: 'This is a test inbox idea'
    }
  ];

  for (let i = 0; i < inboxItems.length; i++) {
    const item = inboxItems[i];
    const inboxItemMd = `---
type: "${item.type}"
title: "${item.title}"
captured: "2024-01-01T00:00:00.000Z"
---

${item.content}
`;
    await fs.writeFile(path.join(inboxDir, `test-inbox-${i + 1}.md`), inboxItemMd);
  }

  // Create reviews directory and test reviews
  const reviewsDir = path.join(testDataDir, 'reviews', 'daily');
  await fs.mkdir(reviewsDir, { recursive: true });

  // Create multiple test reviews
  const reviews = [
    { date: '2024-01-01', title: 'Daily Review - 2024-01-01' },
    { date: '2024-01-02', title: 'Daily Review - 2024-01-02' },
    { date: '2024-01-03', title: 'Daily Review - 2024-01-03' }
  ];

  for (const review of reviews) {
    const reviewMd = `---
type: daily
date: ${review.date}
---

# ${review.title}

## Reflection
- Test went well
- All tests passed

## Tomorrow's Focus
- More testing
- Fix failing tests

## Notes
Test content for save and edit functionality.
`;
    await fs.writeFile(path.join(reviewsDir, `${review.date}.md`), reviewMd);
  }

  // Copy test data to main data directory
  // This is needed because Astro reads from the data directory
  await fs.mkdir(mainDataDir, { recursive: true });

  // Copy directories one by one
  const dirsToCopy = ['areas', 'inbox', 'reviews'];
  for (const dir of dirsToCopy) {
    const src = path.join(testDataDir, dir);
    const dest = path.join(mainDataDir, dir);

    try {
      execSync(`cp -r "${src}" "${dest}"`, { stdio: 'inherit' });
    } catch (e) {
      console.warn(`Failed to copy ${dir}:`, e);
    }
  }

  console.log('Global test setup completed');
}

export default globalSetup;