/**
 * Documentation Generator
 *
 * Generates Markdown/MDX documentation from component inventory and design tokens.
 * Creates structured documentation files for:
 * - Individual components (with props tables, examples, variants)
 * - Design tokens (with visual examples)
 * - Patterns and templates
 *
 * Outputs: MDX files in src/pages/design-showcase/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  srcDir: path.resolve(__dirname, '../../src'),
  dataDir: path.resolve(__dirname, '../../design-system-data'),
  outputDir: path.resolve(__dirname, '../../src/pages/design-showcase'),
  docsDir: path.resolve(__dirname, '../docs'),
};

/**
 * Load component inventory and design tokens
 */
function loadData() {
  const inventoryPath = path.join(CONFIG.dataDir, 'component-inventory.json');
  const tokensPath = path.join(CONFIG.dataDir, 'design-tokens.json');

  let inventory = { components: [] };
  let tokens = { tokens: { colors: {}, spacing: {}, typography: {}, borderRadius: {} } };

  if (fs.existsSync(inventoryPath)) {
    inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
  }

  if (fs.existsSync(tokensPath)) {
    tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
  }

  return { inventory, tokens };
}

/**
 * Generate MDX documentation for a single component
 */
function generateComponentDoc(component) {
  const { name, filePath, category, props, variants, states, usageCount, accessibility } = component;

  let doc = `---
import AppLayout from "../../layouts/AppLayout.astro";
import ${name} from "../../components/ui${filePath.replace(name, '').replace('/ui', '')}/${name}";
import Heading from "../../components/ui/Heading.astro";
import CodeBlock from "../../components/ui/CodeBlock.astro";

const title = "${name} Component | Design System";
---

<AppLayout title={title} currentPath="/design-showcase/components/${name.toLowerCase()}">
    <div class="max-w-6xl mx-auto space-y-8">
        <!-- Header -->
        <div class="space-y-4">
            <div class="flex items-center gap-2 text-sm text-text-muted">
                <span class="px-2 py-1 bg-primary/10 rounded">${category}</span>
                <span>•</span>
                <span>${filePath}</span>
            </div>
            <Heading level={1}>${name}</Heading>
            <p class="text-lg text-text-muted">
                ${generateComponentDescription(component)}
            </p>
        </div>

        <!-- Live Preview -->
        <section>
            <Heading level={2}>Live Preview</Heading>
            <div class="bg-surface rounded-lg p-8 border border-border">
                ${generateLivePreview(component)}
            </div>
        </section>

        <!-- Props -->
        ${props.length > 0 ? generatePropsSection(props) : ''}

        <!-- Variants -->
        ${variants.length > 0 ? generateVariantsSection(variants, name) : ''}

        <!-- States -->
        ${states.length > 0 ? generateStatesSection(states, name) : ''}

        <!-- Usage Examples -->
        <section>
            <Heading level={2}>Usage Examples</Heading>
            ${generateUsageExamples(component)}
        </section>

        <!-- Accessibility -->
        <section>
            <Heading level={2}>Accessibility</Heading>
            ${generateAccessibilitySection(accessibility)}
        </section>

        <!-- Related Components -->
        <section>
            <Heading level={2}>Related Components</Heading>
            ${generateRelatedComponents(component)}
        </section>
    </div>
</AppLayout>
`;

  return doc;
}

/**
 * Generate component description
 */
function generateComponentDescription(component) {
  const descriptions = {
    button: 'Interactive button component with multiple variants and sizes.',
    input: 'Form input field with validation and styling support.',
    card: 'Container component for grouping related content.',
    dialog: 'Modal dialog for focused user interactions.',
    alert: 'Notification component for displaying important messages.',
    badge: 'Small label or status indicator.',
    switch: 'Toggle switch for binary choices.',
    checkbox: 'Form checkbox for multi-select options.',
    select: 'Dropdown select component for choosing from options.',
    tabs: 'Tabbed navigation component for organizing content.',
    default: 'Reusable UI component built with accessibility and flexibility in mind.',
  };

  const category = component.category;
  for (const [key, desc] of Object.entries(descriptions)) {
    if (component.name.toLowerCase().includes(key)) {
      return desc;
    }
  }

  return descriptions.default;
}

/**
 * Generate live preview code
 */
function generateLivePreview(component) {
  const name = component.name;

  // Generate example based on component type
  if (name.toLowerCase().includes('button')) {
    return `
<${name} variant="default">
    Click me
</${name}>
<${name} variant="outline">
    Cancel
</${name}>
<${name} variant="ghost" size="sm">
    Small
</${name}>
    `.trim();
  } else if (name.toLowerCase().includes('card')) {
    return `
<${name} class="p-6">
    <h3 class="text-lg font-semibold mb-2">Card Title</h3>
    <p class="text-text-muted">Card content goes here.</p>
</${name}>
    `.trim();
  } else if (name.toLowerCase().includes('input')) {
    return `
<div class="space-y-4">
    <div>
        <label class="block text-sm font-medium mb-2">Default Input</label>
        <${name} type="text" placeholder="Enter text..." />
    </div>
</div>
    `.trim();
  } else {
    return `<${name} />`;
  }
}

/**
 * Generate props table section
 */
function generatePropsSection(props) {
  const rows = props.map(prop => {
    return `
        <tr>
            <td class="px-4 py-2 font-mono text-sm">${prop.name}${prop.required ? '' : '?'}</td>
            <td class="px-4 py-2 font-mono text-sm text-text-muted">${prop.type}</td>
            <td class="px-4 py-2 text-center">${prop.required ? '✓' : '—'}</td>
            <td class="px-4 py-2 font-mono text-sm">${prop.default || '—'}</td>
            <td class="px-4 py-2 text-sm">${prop.description || '—'}</td>
        </tr>
      `;
  }).join('');

  return `
<section>
    <Heading level={2}>Props</Heading>
    <div class="overflow-x-auto">
        <table class="w-full border-collapse">
            <thead>
                <tr class="border-b border-border">
                    <th class="px-4 py-2 text-left text-sm font-semibold">Name</th>
                    <th class="px-4 py-2 text-left text-sm font-semibold">Type</th>
                    <th class="px-4 py-2 text-center text-sm font-semibold">Required</th>
                    <th class="px-4 py-2 text-left text-sm font-semibold">Default</th>
                    <th class="px-4 py-2 text-left text-sm font-semibold">Description</th>
                </tr>
            </thead>
            <tbody>
${rows}
            </tbody>
        </table>
    </div>
</section>
  `;
}

/**
 * Generate variants section
 */
function generateVariantsSection(variants, componentName) {
  const variantExamples = variants.map(variant => {
    return `
        <div class="p-4 bg-surface rounded border border-border">
            <${componentName} variant="${variant}" />
            <p class="text-xs text-text-muted mt-2 font-mono">variant="${variant}"</p>
        </div>
      `;
  }).join('');

  return `
<section>
    <Heading level={2}>Variants</Heading>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
${variantExamples}
    </div>
</section>
  `;
}

/**
 * Generate states section
 */
function generateStatesSection(states, componentName) {
  const stateExamples = states.map(state => {
    return `
        <div class="p-4 bg-surface rounded border border-border">
            <${componentName} ${state}={true} />
            <p class="text-xs text-text-muted mt-2 font-mono">${state}={true}</p>
        </div>
      `;
  }).join('');

  return `
<section>
    <Heading level={2}>States</Heading>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
${stateExamples}
    </div>
</section>
  `;
}

/**
 * Generate usage examples
 */
function generateUsageExamples(component) {
  const name = component.name;

  return `
<div class="space-y-6">
    <div>
        <h3 class="text-sm font-semibold mb-2">Basic Usage</h3>
        <pre class="bg-surface p-4 rounded-lg overflow-x-auto text-sm"><code>&lt;${name} /&gt;</code></pre>
    </div>
    ${generateComplexExample(component)}
</div>
  `;
}

/**
 * Generate complex usage example
 */
function generateComplexExample(component) {
  const name = component.name;

  if (name.toLowerCase().includes('button')) {
    return `
    <div>
        <h3 class="text-sm font-semibold mb-2">With Custom Styling</h3>
        <pre class="bg-surface p-4 rounded-lg overflow-x-auto text-sm"><code>&lt;${name}
    variant="default"
    size="lg"
    class="w-full"
    disabled={false}
&gt;
    Click Me
&lt;/${name}&gt;</code></pre>
    </div>
    `;
  }

  return '';
}

/**
 * Generate accessibility section
 */
function generateAccessibilitySection(accessibility) {
  return `
<div class="space-y-4">
    <div class="grid grid-cols-2 gap-4">
        <div class="p-4 bg-surface rounded border border-border">
            <h4 class="font-semibold mb-2">Keyboard Support</h4>
            <p class="text-sm ${accessibility.keyboardSupport ? 'text-success' : 'text-text-muted'}">
                ${accessibility.keyboardSupport ? '✓ Fully keyboard accessible' : 'Limited keyboard support'}
            </p>
        </div>
        <div class="p-4 bg-surface rounded border border-border">
            <h4 class="font-semibold mb-2">Screen Reader</h4>
            <p class="text-sm text-text-muted">
                ${accessibility.screenReaderSupport === 'yes' ? '✓ Full support' : 'Support unknown'}
            </p>
        </div>
    </div>
    ${accessibility.ariaAttributes.length > 0 ? `
    <div>
        <h4 class="font-semibold mb-2">ARIA Attributes</h4>
        <div class="flex flex-wrap gap-2">
            ${accessibility.ariaAttributes.map(attr =>
                `<code class="px-2 py-1 bg-surface rounded text-sm">${attr}</code>`
            ).join('')}
        </div>
    </div>
    ` : ''}
</div>
  `;
}

/**
 * Generate related components section
 */
function generateRelatedComponents(component) {
  // Find related components by category
  const relatedByCategory = [];
  const relatedByUsage = [];

  // This would be populated by analyzing the component inventory
  // For now, return a placeholder
  return `
<p class="text-text-muted">
    No specific related components identified yet.
</p>
  `;
}

/**
 * Generate design tokens documentation
 */
function generateTokensDoc(tokens) {
  const { colors, spacing, typography, borderRadius } = tokens.tokens;

  let doc = `---
import AppLayout from "../../layouts/AppLayout.astro";
import Heading from "../../components/ui/Heading.astro";
import Palette from "~icons/lucide/palette";

const title = "Design Tokens | Design System";
---

<AppLayout title={title} currentPath="/design-showcase/design-tokens">
    <div class="max-w-6xl mx-auto space-y-12">
        <div class="space-y-4">
            <div class="flex items-center gap-3">
                <Palette class="h-8 w-8 text-primary" />
                <Heading level={1}>Design Tokens</Heading>
            </div>
            <p class="text-lg text-text-muted">
                ActionAmp's design token system provides a single source of truth for all design decisions.
                These tokens ensure consistency across the application and make it easy to update the design system.
            </p>
        </div>

        <!-- Colors -->
        ${generateColorSection(colors)}

        <!-- Typography -->
        ${generateTypographySection(typography)}

        <!-- Spacing -->
        ${generateSpacingSection(spacing)}

        <!-- Border Radius -->
        ${generateBorderRadiusSection(borderRadius)}
    </div>
</AppLayout>
`;

  return doc;
}

/**
 * Generate color tokens section
 */
function generateColorSection(colors) {
  const colorGroups = {
    brand: [],
    neutral: [],
    semantic: [],
    other: [],
  };

  // Group colors
  for (const [name, token] of Object.entries(colors)) {
    if (['primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'accent', 'accent-foreground'].includes(name)) {
      colorGroups.brand.push({ name, token });
    } else if (['background', 'foreground', 'surface', 'surface-hover', 'border', 'text-main', 'text-muted'].includes(name)) {
      colorGroups.neutral.push({ name, token });
    } else if (['destructive', 'destructive-foreground', 'success', 'warning', 'info'].includes(name)) {
      colorGroups.semantic.push({ name, token });
    } else {
      colorGroups.other.push({ name, token });
    }
  }

  const colorSwatches = (group) => group.map(({ name, token }) => {
    const color = token.format === 'hex' ? token.value : '#6366f1';
    return `
        <div class="space-y-1">
            <div class="h-20 rounded-lg border border-border" style="background-color: ${color}"></div>
            <div class="text-sm">
                <div class="font-mono font-semibold">${name}</div>
                <div class="text-text-muted font-mono text-xs">${color}</div>
            </div>
        </div>
      `;
  }).join('');

  return `
<section>
    <Heading level={2}>Colors</Heading>

    <div class="space-y-8">
        ${colorGroups.brand.length > 0 ? `
        <div>
            <h3 class="text-lg font-semibold mb-4">Brand Colors</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                ${colorSwatches(colorGroups.brand)}
            </div>
        </div>
        ` : ''}

        ${colorGroups.neutral.length > 0 ? `
        <div>
            <h3 class="text-lg font-semibold mb-4">Neutral Colors</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                ${colorSwatches(colorGroups.neutral)}
            </div>
        </div>
        ` : ''}

        ${colorGroups.semantic.length > 0 ? `
        <div>
            <h3 class="text-lg font-semibold mb-4">Semantic Colors</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                ${colorSwatches(colorGroups.semantic)}
            </div>
        </div>
        ` : ''}
    </div>
</section>
  `;
}

/**
 * Generate typography section
 */
function generateTypographySection(typography) {
  return `
<section>
    <Heading level={2}>Typography</Heading>
    <div class="space-y-6">
        ${Object.entries(typography).map(([name, token]) => `
            <div>
                <h3 class="text-sm font-semibold text-text-muted mb-2 font-mono">${name}</h3>
                <p style="${token.type === 'font' ? `font-family: ${token.value}` : ''}">${token.value}</p>
            </div>
        `).join('')}
    </div>
</section>
  `;
}

/**
 * Generate spacing section
 */
function generateSpacingSection(spacing) {
  return `
<section>
    <Heading level={2}>Spacing</Heading>
    <p class="text-text-muted mb-4">Spacing scale based on a 4px (0.25rem) base unit.</p>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${Object.entries(spacing).map(([name, token]) => `
            <div class="p-4 bg-surface rounded border border-border">
                <div class="font-mono text-sm font-semibold">${name}</div>
                <div class="text-text-muted text-sm">${token.value}</div>
            </div>
        `).join('')}
    </div>
</section>
  `;
}

/**
 * Generate border radius section
 */
function generateBorderRadiusSection(borderRadius) {
  return `
<section>
    <Heading level={2}>Border Radius</Heading>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${Object.entries(borderRadius).map(([name, token]) => `
            <div class="space-y-2">
                <div class="h-20 bg-surface rounded border border-border flex items-center justify-center" style="border-radius: ${token.value}">
                    <span class="text-sm font-mono">${name}</span>
                </div>
                <div class="text-center">
                    <div class="font-mono text-sm">${token.value}</div>
                </div>
            </div>
        `).join('')}
    </div>
</section>
  `;
}

/**
 * Generate index page with all components
 */
function generateComponentsIndex(inventory) {
  const componentsByCategory = {};

  // Group components by category
  for (const component of inventory.components) {
    if (!componentsByCategory[component.category]) {
      componentsByCategory[component.category] = [];
    }
    componentsByCategory[component.category].push(component);
  }

  let doc = `---
import AppLayout from "../../layouts/AppLayout.astro";
import Heading from "../../components/ui/Heading.astro";
import Layers from "~icons/lucide/layers";
import Card from "../../components/ui/Card.astro";

const title = "Components | Design System";
---

<AppLayout title={title} currentPath="/design-showcase/components">
    <div class="max-w-6xl mx-auto space-y-8">
        <div class="space-y-4">
            <div class="flex items-center gap-3">
                <Layers class="h-8 w-8 text-primary" />
                <Heading level={1}>UI Components</Heading>
            </div>
            <p class="text-lg text-text-muted">
                A comprehensive library of ${inventory.totalComponents} reusable UI components.
                Click on any component to view detailed documentation, props, and examples.
            </p>
        </div>

        ${Object.entries(componentsByCategory).map(([category, components]) => `
        <section>
            <Heading level={2}>${category.charAt(0).toUpperCase() + category.slice(1)}</Heading>
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                ${components.map(comp => `
                <a href="/design-showcase/components/${comp.name.toLowerCase()}" class="group">
                    <Card class="p-6 hover:shadow-lg transition-all duration-200 border border-transparent group-hover:border-primary/50">
                        <div class="flex items-start justify-between">
                            <div>
                                <h3 class="text-lg font-semibold group-hover:text-primary transition-colors">${comp.name}</h3>
                                <p class="text-sm text-text-muted mt-1">${comp.framework}</p>
                            </div>
                            ${comp.usageCount > 0 ? `
                            <span class="px-2 py-1 bg-primary/10 rounded text-xs font-semibold">
                                ${comp.usageCount} uses
                            </span>
                            ` : ''}
                        </div>
                        ${comp.props.length > 0 ? `
                        <div class="mt-4">
                            <span class="text-xs text-text-muted">${comp.props.length} props</span>
                        </div>
                        ` : ''}
                    </Card>
                </a>
                `).join('')}
            </div>
        </section>
        `).join('')}
    </div>
</AppLayout>
`;

  return doc;
}

/**
 * Main execution function
 */
function main() {
  console.log('📝 Generating documentation...\n');

  // Load data
  console.log('📂 Loading component inventory and design tokens...');
  const { inventory, tokens } = loadData();

  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // Generate component documentation
  console.log('📄 Generating component documentation...');
  for (const component of inventory.components) {
    const doc = generateComponentDoc(component);
    const outputPath = path.join(CONFIG.outputDir, 'components', `${component.name.toLowerCase()}.astro`);

    // Ensure components subdirectory exists
    const componentsDir = path.join(CONFIG.outputDir, 'components');
    if (!fs.existsSync(componentsDir)) {
      fs.mkdirSync(componentsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, doc);
    console.log(`   ✓ ${component.name}.astro`);
  }

  // Generate components index
  console.log('\n📑 Generating components index...');
  const indexDoc = generateComponentsIndex(inventory);
  const indexPath = path.join(CONFIG.outputDir, 'components.astro');
  fs.writeFileSync(indexPath, indexDoc);
  console.log(`   ✓ components.astro`);

  // Generate design tokens documentation
  console.log('\n🎨 Generating design tokens documentation...');
  const tokensDoc = generateTokensDoc(tokens);
  const tokensPath = path.join(CONFIG.outputDir, 'design-tokens.astro');
  fs.writeFileSync(tokensPath, tokensDoc);
  console.log(`   ✓ design-tokens.astro`);

  console.log('\n✅ Documentation generation complete!');
  console.log(`   Generated ${inventory.components.length} component pages`);
  console.log(`   Generated 1 components index`);
  console.log(`   Generated 1 design tokens page`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as generateDocs };
