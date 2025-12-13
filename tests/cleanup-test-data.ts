import fs from 'node:fs/promises';
import path from 'node:path';

// Run this script to clean up any test-generated data
async function cleanupTestData() {
  const dataDir = path.join(process.cwd(), 'data');

  // Clean up test inbox items
  const inboxDir = path.join(dataDir, 'inbox');
  try {
    const files = await fs.readdir(inboxDir);
    for (const file of files) {
      // Skip non-test files (look for patterns indicating test files)
      if (file.includes('api-') || file.includes('test-') ||
          file.includes('clickable-') || file.includes('buy-') ||
          file.includes('detail-')) {
        await fs.rm(path.join(inboxDir, file), { force: true });
        console.log(`Cleaned up test file: ${file}`);
      }
    }
  } catch (e) {
    // Directory might not exist, that's OK
  }

  // Clean up test reviews
  const reviewsDir = path.join(dataDir, 'reviews', 'daily');
  try {
    const files = await fs.readdir(reviewsDir);
    const today = new Date().toISOString().split('T')[0];
    for (const file of files) {
      // Clean up today's test reviews
      if (file === `${today}.md`) {
        const content = await fs.readFile(path.join(reviewsDir, file), 'utf-8');
        if (content.includes('## Daily Review -') || content.includes('Test Review')) {
          await fs.rm(path.join(reviewsDir, file), { force: true });
          console.log(`Cleaned up test review: ${file}`);
        }
      }
    }
  } catch (e) {
    // Directory might not exist, that's OK
  }

  console.log('Test data cleanup completed');
}

// Run cleanup
cleanupTestData().catch(console.error);