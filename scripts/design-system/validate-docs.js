/**
 * Documentation Validation Script
 *
 * Validates documentation consistency:
 * - Compares documented components vs. discovered components
 * - Flags undocumented components
 * - Flags documented but unused components
 * - Checks token references in code vs. token documentation
 * - Runs as CI check to prevent drift
 *
 * Exits with non-zero code if validation fails
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  srcDir: path.resolve(__dirname, '../../src'),
  dataDir: path.resolve(__dirname, '../../design-system-data'),
  docsDir: path.resolve(__dirname, '../../src/pages/design-showcase'),
};

/**
 * Validation results
 */
let results = {
  errors: [],
  warnings: [],
  passed: [],
};

/**
 * Load component inventory
 */
function loadInventory() {
  const inventoryPath = path.join(CONFIG.dataDir, 'component-inventory.json');

  if (!fs.existsSync(inventoryPath)) {
    throw new Error('Component inventory not found. Run discover-components.js first.');
  }

  return JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
}

/**
 * Load design tokens
 */
function loadTokens() {
  const tokensPath = path.join(CONFIG.dataDir, 'design-tokens.json');

  if (!fs.existsSync(tokensPath)) {
    throw new Error('Design tokens not found. Run extract-tokens.js first.');
  }

  return JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
}

/**
 * Check for undocumented components
 */
function checkUndocumentedComponents(inventory) {
  console.log('\n🔍 Checking for undocumented components...');

  const documentedComponents = new Set();
  const componentsDir = path.join(CONFIG.docsDir, 'components');

  if (fs.existsSync(componentsDir)) {
    const files = fs.readdirSync(componentsDir);
    for (const file of files) {
      if (file.endsWith('.astro') || file.endsWith('.mdx')) {
        const name = path.basename(file, path.extname(file));
        documentedComponents.add(name.toLowerCase());
      }
    }
  }

  const undocumented = [];
  for (const component of inventory.components) {
    const componentName = component.name.toLowerCase();
    if (!documentedComponents.has(componentName)) {
      undocumented.push({
        name: component.name,
        path: component.filePath,
        category: component.category,
      });
    }
  }

  if (undocumented.length > 0) {
    results.errors.push({
      check: 'Undocumented Components',
      count: undocumented.length,
      details: undocumented,
    });
    console.error(`   ✗ Found ${undocumented.length} undocumented components:`);
    undocumented.forEach(c => console.error(`      - ${c.name} (${c.path})`));
  } else {
    results.passed.push('All components are documented');
    console.log('   ✓ All components documented');
  }
}

/**
 * Check for orphaned documentation (docs without components)
 */
function checkOrphanedDocumentation(inventory) {
  console.log('\n🔍 Checking for orphaned documentation...');

  const componentNames = new Set(
    inventory.components.map(c => c.name.toLowerCase())
  );

  const orphaned = [];
  const componentsDir = path.join(CONFIG.docsDir, 'components');

  if (fs.existsSync(componentsDir)) {
    const files = fs.readdirSync(componentsDir);
    for (const file of files) {
      if (file.endsWith('.astro') || file.endsWith('.mdx')) {
        const name = path.basename(file, path.extname(file));
        if (!componentNames.has(name) && name !== 'index') {
          orphaned.push({
            name,
            file,
          });
        }
      }
    }
  }

  if (orphaned.length > 0) {
    results.warnings.push({
      check: 'Orphaned Documentation',
      count: orphaned.length,
      details: orphaned,
    });
    console.warn(`   ⚠ Found ${orphaned.length} orphaned documentation files:`);
    orphaned.forEach(d => console.warn(`      - ${d.file}`));
  } else {
    results.passed.push('No orphaned documentation found');
    console.log('   ✓ No orphaned documentation');
  }
}

/**
 * Check for documented but unused components
 */
function checkUnusedComponents(inventory) {
  console.log('\n🔍 Checking for unused components...');

  const unused = inventory.components.filter(c => c.usageCount === 0);

  if (unused.length > 0) {
    results.warnings.push({
      check: 'Unused Components',
      count: unused.length,
      details: unused.map(c => ({ name: c.name, path: c.filePath })),
    });
    console.warn(`   ⚠ Found ${unused.length} unused components:`);
    unused.forEach(c => console.warn(`      - ${c.name}`));
  } else {
    results.passed.push('All components are used');
    console.log('   ✓ All components are used');
  }
}

/**
 * Validate design token references
 */
function checkTokenReferences(tokens) {
  console.log('\n🔍 Checking design token references...');

  const tokenNames = new Set(Object.keys(tokens.tokens.colors));

  // Check for missing token documentation
  const documentedTokens = new Set();
  const tokensDoc = path.join(CONFIG.docsDir, 'design-tokens.astro');

  if (fs.existsSync(tokensDoc)) {
    const content = fs.readFileSync(tokensDoc, 'utf-8');

    // Extract color names from documentation
    const colorRegex = /(?:name|key)=["']([^"']+)["']/g;
    let match;
    while ((match = colorRegex.exec(content)) !== null) {
      documentedTokens.add(match[1]);
    }
  }

  const undocumentedTokens = [...tokenNames].filter(t => !documentedTokens.has(t));

  if (undocumentedTokens.length > 0) {
    results.warnings.push({
      check: 'Undocumented Tokens',
      count: undocumentedTokens.length,
      details: undocumentedTokens,
    });
    console.warn(`   ⚠ Found ${undocumentedTokens.length} undocumented tokens:`);
    undocumentedTokens.forEach(t => console.warn(`      - ${t}`));
  } else {
    results.passed.push('All tokens documented');
    console.log('   ✓ All tokens documented');
  }
}

/**
 * Check for broken imports in documentation
 */
function checkDocumentationImports() {
  console.log('\n🔍 Checking documentation imports...');

  const brokenImports = [];
  const docsDir = CONFIG.docsDir;

  function checkDirectory(dir) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        checkDirectory(fullPath);
      } else if (file.endsWith('.astro') || file.endsWith('.mdx')) {
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Check for component imports
        const importRegex = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const [, name, importPath] = match;

          // Resolve relative path
          let resolvedPath;
          if (importPath.startsWith('.')) {
            resolvedPath = path.resolve(path.dirname(fullPath), importPath);

            // Try common extensions
            let found = false;
            for (const ext of ['.astro', '.tsx', '.jsx', '.ts', '.js']) {
              if (fs.existsSync(resolvedPath + ext)) {
                found = true;
                break;
              }
            }

            // Check for index files
            if (!found && fs.existsSync(path.join(resolvedPath, 'index.astro'))) {
              found = true;
            }

            if (!found) {
              brokenImports.push({
                file: fullPath.replace(CONFIG.srcDir, ''),
                importee: name,
                path: importPath,
              });
            }
          }
        }
      }
    }
  }

  checkDirectory(docsDir);

  if (brokenImports.length > 0) {
    results.errors.push({
      check: 'Broken Imports',
      count: brokenImports.length,
      details: brokenImports,
    });
    console.error(`   ✗ Found ${brokenImports.length} broken imports:`);
    brokenImports.forEach(imp => {
      console.error(`      - ${imp.file}: import ${imp.importee} from '${imp.path}'`);
    });
  } else {
    results.passed.push('All imports valid');
    console.log('   ✓ All imports valid');
  }
}

/**
 * Check props documentation completeness
 */
function checkPropsDocumentation(inventory) {
  console.log('\n🔍 Checking props documentation...');

  const incompleteProps = [];

  for (const component of inventory.components) {
    const propsWithoutDescriptions = component.props.filter(p => !p.description);

    if (propsWithoutDescriptions.length > 0) {
      incompleteProps.push({
        component: component.name,
        props: propsWithoutDescriptions.map(p => p.name),
      });
    }
  }

  if (incompleteProps.length > 0) {
    results.warnings.push({
      check: 'Props Documentation',
      count: incompleteProps.length,
      details: incompleteProps,
    });
    console.warn(`   ⚠ Found ${incompleteProps.length} components with incomplete props documentation:`);
    incompleteProps.forEach(c => {
      console.warn(`      - ${c.component}: ${c.props.length} props missing descriptions`);
    });
  } else {
    results.passed.push('All props documented');
    console.log('   ✓ All props have descriptions');
  }
}

/**
 * Generate validation report
 */
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION REPORT');
  console.log('='.repeat(60));

  console.log(`\n✅ Passed: ${results.passed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  console.log(`❌ Errors: ${results.errors.length}`);

  if (results.passed.length > 0) {
    console.log('\nPassed Checks:');
    results.passed.forEach(check => console.log(`  ✓ ${check}`));
  }

  if (results.warnings.length > 0) {
    console.log('\nWarnings:');
    results.warnings.forEach(warning => {
      console.log(`  ⚠️  ${warning.check}: ${warning.count} issues`);
    });
  }

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(error => {
      console.log(`  ❌ ${error.check}: ${error.count} issues`);
    });
  }

  // Save report to file
  const reportPath = path.join(CONFIG.dataDir, 'validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);
}

/**
 * Main execution function
 */
function main() {
  console.log('🔍 Validating documentation...\n');

  try {
    // Load data
    console.log('📂 Loading data...');
    const inventory = loadInventory();
    const tokens = loadTokens();

    // Run validation checks
    checkUndocumentedComponents(inventory);
    checkOrphanedDocumentation(inventory);
    checkUnusedComponents(inventory);
    checkTokenReferences(tokens);
    checkDocumentationImports();
    checkPropsDocumentation(inventory);

    // Generate report
    generateReport();

    // Exit with appropriate code
    if (results.errors.length > 0) {
      console.log('\n❌ Validation failed!');
      process.exit(1);
    } else if (results.warnings.length > 0) {
      console.log('\n⚠️  Validation passed with warnings');
      process.exit(0);
    } else {
      console.log('\n✅ Validation passed!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Validation error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validateDocs: main };
