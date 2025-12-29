/**
 * Component Discovery Script
 *
 * Scans the codebase for React/Astro components and extracts metadata:
 * - Component names and file paths
 * - Props interfaces
 * - Variants and styling approaches
 * - Usage patterns across the application
 * - Dependencies
 *
 * Outputs: component-inventory.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  srcDir: path.resolve(__dirname, '../../src'),
  outputDir: path.resolve(__dirname, '../../design-system-data'),
  patterns: ['**/*.tsx', '**/*.jsx', '**/*.astro'],
  excludeDirs: ['node_modules', '.worktrees', 'dist'],
};

// Component categories based on common patterns
const CATEGORIES = {
  layout: ['layout', 'container', 'wrapper', 'grid', 'flex', 'section'],
  form: ['input', 'button', 'form', 'field', 'label', 'select', 'checkbox', 'switch', 'textarea'],
  navigation: ['nav', 'menu', 'tab', 'breadcrumb', 'pagination', 'link'],
  feedback: ['alert', 'toast', 'modal', 'dialog', 'spinner', 'skeleton', 'badge'],
  'data-display': ['table', 'list', 'card', 'tooltip', 'popover', 'chart'],
};

/**
 * Recursively find all component files
 */
function findComponentFiles(dir, excludeDirs = []) {
  const files = [];

  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!excludeDirs.includes(item)) {
          traverse(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (['.tsx', '.jsx', '.astro'].includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  traverse(dir);
  return files;
}

/**
 * Extract component metadata from file content
 */
function extractComponentMetadata(filePath, content) {
  const metadata = {
    name: '',
    filePath: filePath.replace(CONFIG.srcDir, '').replace(/\\/g, '/'),
    category: 'other',
    props: [],
    variants: [],
    states: [],
    usageCount: 0,
    usageLocations: [],
    dependencies: [],
    accessibility: {
      keyboardSupport: false,
      ariaAttributes: [],
      screenReaderSupport: 'unknown',
    },
    examples: [],
    framework: detectFramework(filePath),
  };

  // Extract component name
  const fileName = path.basename(filePath, path.extname(filePath));
  metadata.name = fileName;

  // Detect category from file name
  metadata.category = detectCategory(fileName);

  // Extract props interface/type
  if (metadata.framework === 'react') {
    extractReactProps(content, metadata);
  } else if (metadata.framework === 'astro') {
    extractAstroProps(content, metadata);
  }

  // Extract variants from CVA or similar
  extractVariants(content, metadata);

  // Extract accessibility features
  extractAccessibilityFeatures(content, metadata);

  // Extract dependencies (imports)
  extractDependencies(content, metadata);

  return metadata;
}

/**
 * Detect framework from file extension
 */
function detectFramework(filePath) {
  const ext = path.extname(filePath);
  if (ext === '.astro') return 'astro';
  if (ext === '.tsx' || ext === '.jsx') return 'react';
  return 'unknown';
}

/**
 * Detect component category from name
 */
function detectCategory(name) {
  const lowerName = name.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(keyword => lowerName.includes(keyword))) {
      return category;
    }
  }

  return 'other';
}

/**
 * Extract props from React component
 */
function extractReactProps(content, metadata) {
  // Look for interface definitions
  const interfaceRegex = /interface\s+(\w+)\s*{([^}]+)}/gs;
  const typeRegex = /type\s+(\w+)\s*=\s*{([^}]+)}/gs;

  const props = [];

  let match;
  while ((match = interfaceRegex.exec(content)) !== null) {
    const [, interfaceName, interfaceBody] = match;
    if (interfaceName.includes('Props')) {
      parsePropsBody(interfaceBody, props);
    }
  }

  while ((match = typeRegex.exec(content)) !== null) {
    const [, typeName, typeBody] = match;
    if (typeName.includes('Props')) {
      parsePropsBody(typeBody, props);
    }
  }

  metadata.props = props;
}

/**
 * Extract props from Astro component
 */
function extractAstroProps(content, metadata) {
  // Astro props are defined in the frontmatter
  const propsRegex = /interface\s+Props\s*{([^}]+)}/s;
  const match = propsRegex.exec(content);

  if (match) {
    const props = [];
    parsePropsBody(match[1], props);
    metadata.props = props;
  }
}

/**
 * Parse props body and extract prop definitions
 */
function parsePropsBody(body, props) {
  const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

  for (const line of lines) {
    // Match: name: type;
    // Or: name?: type;
    // Or: name: type = default;
    const propMatch = line.match(/(\w+)(\?)?:\s*([^;=]+)(?:\s*=\s*([^;]+))?;?/);
    if (propMatch) {
      const [, name, optional, type, defaultValue] = propMatch;
      props.push({
        name,
        type: type.trim(),
        required: !optional,
        default: defaultValue ? defaultValue.trim() : undefined,
        description: '',
      });
    }
  }
}

/**
 * Extract variants from class-variance-authority or similar
 */
function extractVariants(content, metadata) {
  // Look for CVA definitions
  const cvaRegex = /cva\(\s*["']([^"']+)["'][\s\S]*?variants:\s*{([^}]+)}/s;
  const match = cvaRegex.exec(content);

  if (match) {
    const [, baseClasses, variantsBody] = match;

    // Parse variant keys
    const variantKeys = variantsBody.match(/(\w+):\s*{/g);
    if (variantKeys) {
      metadata.variants = variantKeys.map(key => key.replace(/:\s*{/, '').trim());
    }
  }

  // Look for variant enums in props
  const variantEnumRegex = /variant[^}]*?:\s*["']([^"']+)["'][\s\S]*?\(([^)]+)\)/;
  const enumMatch = variantEnumRegex.exec(content);
  if (enumMatch) {
    const [, , variants] = enumMatch;
    metadata.variants.push(...variants.split('|').map(v => v.trim().replace(/['"]/g, '')));
  }
}

/**
 * Extract accessibility features
 */
function extractAccessibilityFeatures(content, metadata) {
  // Check for ARIA attributes
  const ariaRegex = /aria-[\w-]+/g;
  const ariaMatches = content.match(ariaRegex);
  if (ariaMatches) {
    metadata.accessibility.ariaAttributes = [...new Set(ariaMatches)];
  }

  // Check for keyboard event handlers
  const keyboardRegex = /on(KeyDown|KeyPress|KeyUp)/g;
  metadata.accessibility.keyboardSupport = keyboardRegex.test(content);

  // Check for screen reader only text
  metadata.accessibility.screenReaderSupport = content.includes('sr-only') ? 'yes' : 'unknown';
}

/**
 * Extract dependencies from imports
 */
function extractDependencies(content, metadata) {
  // Extract import statements
  const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const [, namedImports, defaultImport, source] = match;

    if (source.startsWith('./') || source.startsWith('../')) {
      // Local dependency
      if (namedImports) {
        metadata.dependencies.push(...namedImports.split(',').map(i => i.trim()));
      } else if (defaultImport) {
        metadata.dependencies.push(defaultImport);
      }
    }
  }

  metadata.dependencies = [...new Set(metadata.dependencies)];
}

/**
 * Scan usage of components across the codebase
 */
function scanComponentUsage(componentName, files) {
  const usage = {
    count: 0,
    locations: [],
  };

  const importPatterns = [
    new RegExp(`import\\s+.*?\\b${componentName}\\b.*?from`, 'g'),
    new RegExp(`<${componentName}\\b`, 'g'),
    new RegExp(`<${componentName}\\.[A-Z]\\w+`, 'g'), // For Component.SubComponent
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let fileUsage = 0;

    for (const pattern of importPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        fileUsage += matches.length;
      }
    }

    if (fileUsage > 0) {
      usage.count += fileUsage;
      usage.locations.push({
        file: file.replace(CONFIG.srcDir, ''),
        count: fileUsage,
      });
    }
  }

  return usage;
}

/**
 * Main execution function
 */
function main() {
  console.log('🔍 Discovering components...\n');

  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // Find all component files
  console.log('📁 Scanning for component files...');
  const files = findComponentFiles(CONFIG.srcDir, CONFIG.excludeDirs);
  console.log(`   Found ${files.length} component files\n`);

  // Extract metadata from each file
  console.log('📊 Extracting component metadata...');
  const components = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const metadata = extractComponentMetadata(file, content);

      // Scan usage (excluding the component's own file)
      const otherFiles = files.filter(f => f !== file);
      const usage = scanComponentUsage(metadata.name, otherFiles);

      metadata.usageCount = usage.count;
      metadata.usageLocations = usage.locations.slice(0, 10); // Limit to top 10

      components.push(metadata);
      console.log(`   ✓ ${metadata.name} (${metadata.framework})`);
    } catch (error) {
      console.error(`   ✗ Error processing ${file}:`, error.message);
    }
  }

  // Generate inventory
  const inventory = {
    generatedAt: new Date().toISOString(),
    totalComponents: components.length,
    componentsByCategory: {},
    components,
  };

  // Group by category
  for (const component of components) {
    if (!inventory.componentsByCategory[component.category]) {
      inventory.componentsByCategory[component.category] = [];
    }
    inventory.componentsByCategory[component.category].push(component.name);
  }

  // Write output
  const outputPath = path.join(CONFIG.outputDir, 'component-inventory.json');
  fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2));

  console.log(`\n✅ Component inventory saved to: ${outputPath}`);
  console.log(`   Total components: ${inventory.totalComponents}`);
  console.log('\n📈 Components by category:');
  for (const [category, comps] of Object.entries(inventory.componentsByCategory)) {
    console.log(`   ${category}: ${comps.length}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as discoverComponents };
