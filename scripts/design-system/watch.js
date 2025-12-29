/**
 * Watch Mode for Design System
 *
 * Watches for file changes and automatically runs the design system pipeline.
 * Monitors component files, CSS files, and documentation.
 */

import { exec } from 'child_process';
import { watch } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  srcDir: path.resolve(__dirname, '../../src'),
  debounceMs: 500,
};

let debounceTimer = null;

/**
 * Run the design system build pipeline
 */
function runPipeline() {
  console.log('\n🔄 Running design system pipeline...\n');

  exec('npm run design-system:build', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Pipeline failed: ${error.message}`);
      return;
    }

    if (stderr) {
      console.error(`stderr: ${stderr}`);
    }

    console.log(stdout);
    console.log('\n✅ Pipeline complete!\n');
    console.log('Watching for changes... (Press Ctrl+C to stop)\n');
  });
}

/**
 * Debounced function to prevent excessive runs
 */
function debouncedRun() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  console.log('⏳ Changes detected, debouncing...');
  debounceTimer = setTimeout(() => {
    runPipeline();
  }, CONFIG.debounceMs);
}

/**
 * Start watching files
 */
function startWatch() {
  console.log('👀 Starting design system watch mode...\n');
  console.log('Watching for changes in:');
  console.log('  - src/components/');
  console.log('  - src/styles/');
  console.log('  - src/pages/design-showcase/\n');

  // Initial run
  runPipeline();

  // Watch component directories
  const componentsDir = path.join(CONFIG.srcDir, 'components');
  watch(componentsDir, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.endsWith('.tsx') || filename.endsWith('.jsx') || filename.endsWith('.astro'))) {
      console.log(`\n📝 Component changed: ${filename}`);
      debouncedRun();
    }
  });

  // Watch styles
  const stylesDir = path.join(CONFIG.srcDir, 'styles');
  watch(stylesDir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.css')) {
      console.log(`\n🎨 Style changed: ${filename}`);
      debouncedRun();
    }
  });

  // Watch design showcase pages
  const showcaseDir = path.join(CONFIG.srcDir, 'pages', 'design-showcase');
  watch(showcaseDir, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.endsWith('.astro') || filename.endsWith('.mdx'))) {
      console.log(`\n📄 Documentation changed: ${filename}`);
      debouncedRun();
    }
  });
}

// Handle process exit
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping watch mode...');
  process.exit(0);
});

// Start watching
startWatch();
