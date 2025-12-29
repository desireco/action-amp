/**
 * Design Token Extractor
 *
 * Extracts design tokens from:
 * - Tailwind CSS configuration (@theme blocks)
 * - CSS custom properties (--variables)
 * - JavaScript/TypeScript theme objects
 *
 * Outputs: design-tokens.json with categorized tokens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  srcDir: path.resolve(__dirname, '../../src'),
  outputDir: path.resolve(__dirname, '../../design-system-data'),
  files: {
    css: path.resolve(__dirname, '../../src/styles/global.css'),
  },
};

/**
 * Extract tokens from CSS files
 */
function extractCSSTokens(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const tokens = {
    colors: {},
    spacing: {},
    typography: {},
    borderRadius: {},
    shadows: {},
    animation: {},
  };

  // Extract @theme block variables (Tailwind v4)
  const themeRegex = /@theme\s*{([^}]+)}/gs;
  const themeMatch = themeRegex.exec(content);

  if (themeMatch) {
    parseThemeBlock(themeMatch[1], tokens);
  }

  // Extract :root variables
  const rootRegex = /:root\s*{([^}]+)}/gs;
  let rootMatch;

  while ((rootMatch = rootRegex.exec(content)) !== null) {
    parseCSSVariables(rootMatch[1], tokens);
  }

  return tokens;
}

/**
 * Parse @theme block from Tailwind v4
 */
function parseThemeBlock(themeContent, tokens) {
  const lines = themeContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

  for (const line of lines) {
    // Match: --color-name: #value;
    const colorMatch = line.match(/--color-(\w+(?:-\w+)*):\s*(#[0-9a-fA-F]+);/);
    if (colorMatch) {
      const [, name, value] = colorMatch;
      tokens.colors[name] = {
        value,
        type: 'color',
        format: 'hex',
      };
      continue;
    }

    // Match: --color-name: comment;
    const colorCommentMatch = line.match(/--color-(\w+(?:-\w+)*):\s*(.+?);/);
    if (colorCommentMatch) {
      const [, name, comment] = colorCommentMatch;
      if (!tokens.colors[name]) {
        tokens.colors[name] = {
          value: comment,
          type: 'color',
          format: 'reference',
        };
      }
    }

    // Match: --radius: value;
    const radiusMatch = line.match(/--radius(?:-(\w+))?:\s*([\d.]+(?:rem|px|em)?);/);
    if (radiusMatch) {
      const [, variant, value] = radiusMatch;
      const key = variant || 'default';
      tokens.borderRadius[key] = {
        value,
        type: 'border-radius',
      };
    }

    // Match: --font-xxx: value;
    const fontMatch = line.match(/--font-(\w+):\s*([^;]+);/);
    if (fontMatch) {
      const [, name, value] = fontMatch;
      tokens.typography[name] = {
        value: value.replace(/['"]/g, ''),
        type: 'font',
      };
    }
  }
}

/**
 * Parse CSS custom properties
 */
function parseCSSVariables(variablesContent, tokens) {
  const lines = variablesContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

  for (const line of lines) {
    // Match: --variable-name: value; /* comment */
    const match = line.match(/--([\w-]+):\s*([^;]+);(?:\s*\/\*\s*([^*]+)\s*\/\*)?/);

    if (match) {
      const [, name, value, comment] = match;

      // Categorize tokens by name
      if (name.startsWith('color-') || name === 'background' || name === 'foreground' ||
          name === 'primary' || name === 'secondary' || name === 'accent' ||
          name === 'destructive' || name === 'border' || name === 'input' ||
          name === 'ring' || name === 'muted') {
        if (!tokens.colors[name]) {
          tokens.colors[name] = {
            value: value.trim(),
            type: 'color',
            format: value.trim().startsWith('#') ? 'hex' : 'reference',
            description: comment ? comment.trim() : undefined,
          };
        }
      } else if (name.includes('radius')) {
        tokens.borderRadius[name] = {
          value: value.trim(),
          type: 'border-radius',
          description: comment ? comment.trim() : undefined,
        };
      } else if (name.includes('font') || name.includes('text')) {
        tokens.typography[name] = {
          value: value.trim(),
          type: 'typography',
          description: comment ? comment.trim() : undefined,
        };
      } else if (name.includes('spacing') || name.includes('space')) {
        tokens.spacing[name] = {
          value: value.trim(),
          type: 'spacing',
          description: comment ? comment.trim() : undefined,
        };
      } else if (name.includes('shadow')) {
        tokens.shadows[name] = {
          value: value.trim(),
          type: 'shadow',
          description: comment ? comment.trim() : undefined,
        };
      } else if (name.includes('animation') || name.includes('transition') || name.includes('duration')) {
        tokens.animation[name] = {
          value: value.trim(),
          type: 'animation',
          description: comment ? comment.trim() : undefined,
        };
      }
    }
  }
}

/**
 * Generate token taxonomy mapping
 */
function generateTokenTaxonomy(tokens) {
  const taxonomy = {
    semantic: {},
    primitive: {},
    aliases: {},
  };

  // Map semantic tokens to primitives
  for (const [name, token] of Object.entries(tokens.colors)) {
    if (token.format === 'reference') {
      // This is a semantic token referencing another value
      taxonomy.aliases[name] = token.value;

      // Extract reference
      const refMatch = token.value.match(/var\((--[\w-]+)\)/);
      if (refMatch) {
        taxonomy.semantic[name] = refMatch[1];
      }
    } else {
      taxonomy.primitive[name] = token.value;
    }
  }

  return taxonomy;
}

/**
 * Build frequency analysis for token usage
 */
function analyzeTokenUsage(tokens) {
  // This would scan the codebase for token usage
  // For now, we'll return a placeholder
  return {
    mostUsed: [],
    leastUsed: [],
    unused: [],
  };
}

/**
 * Generate JSON schema for token validation
 */
function generateTokenSchema(tokens) {
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'ActionAmp Design Tokens',
    description: 'JSON schema for validating design token usage',
    type: 'object',
    properties: {},
  };

  // Color tokens
  schema.properties.colors = {
    type: 'object',
    description: 'Color design tokens',
    properties: {},
  };

  for (const [name, token] of Object.entries(tokens.colors)) {
    schema.properties.colors.properties[name] = {
      type: 'string',
      description: token.description || `${name} color token`,
      pattern: token.format === 'hex' ? '^#[0-9a-fA-F]{6}$' : undefined,
    };
  }

  // Spacing tokens
  if (Object.keys(tokens.spacing).length > 0) {
    schema.properties.spacing = {
      type: 'object',
      description: 'Spacing design tokens',
      properties: {},
    };

    for (const [name, token] of Object.entries(tokens.spacing)) {
      schema.properties.spacing.properties[name] = {
        type: 'string',
        description: token.description || `${name} spacing token`,
      };
    }
  }

  // Typography tokens
  if (Object.keys(tokens.typography).length > 0) {
    schema.properties.typography = {
      type: 'object',
      description: 'Typography design tokens',
      properties: {},
    };

    for (const [name, token] of Object.entries(tokens.typography)) {
      schema.properties.typography.properties[name] = {
        type: 'string',
        description: token.description || `${name} typography token`,
      };
    }
  }

  // Border radius tokens
  if (Object.keys(tokens.borderRadius).length > 0) {
    schema.properties.borderRadius = {
      type: 'object',
      description: 'Border radius design tokens',
      properties: {},
    };

    for (const [name, token] of Object.entries(tokens.borderRadius)) {
      schema.properties.borderRadius.properties[name] = {
        type: 'string',
        description: token.description || `${name} border radius token`,
      };
    }
  }

  return schema;
}

/**
 * Main execution function
 */
function main() {
  console.log('🎨 Extracting design tokens...\n');

  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // Extract tokens from CSS
  console.log('📄 Parsing CSS files...');
  const tokens = extractCSSTokens(CONFIG.files.css);

  // Generate taxonomy
  console.log('🔗 Building token taxonomy...');
  const taxonomy = generateTokenTaxonomy(tokens);

  // Analyze usage
  console.log('📊 Analyzing token usage...');
  const usage = analyzeTokenUsage(tokens);

  // Generate schema
  console.log('📜 Generating validation schema...');
  const schema = generateTokenSchema(tokens);

  // Compile output
  const output = {
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    tokens,
    taxonomy,
    usage,
    schema,
    summary: {
      totalColors: Object.keys(tokens.colors).length,
      totalSpacing: Object.keys(tokens.spacing).length,
      totalTypography: Object.keys(tokens.typography).length,
      totalBorderRadius: Object.keys(tokens.borderRadius).length,
      totalShadows: Object.keys(tokens.shadows).length,
      totalAnimation: Object.keys(tokens.animation).length,
    },
  };

  // Write output
  const outputPath = path.join(CONFIG.outputDir, 'design-tokens.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Design tokens saved to: ${outputPath}`);
  console.log('\n📈 Token summary:');
  console.log(`   Colors: ${output.summary.totalColors}`);
  console.log(`   Spacing: ${output.summary.totalSpacing}`);
  console.log(`   Typography: ${output.summary.totalTypography}`);
  console.log(`   Border Radius: ${output.summary.totalBorderRadius}`);
  console.log(`   Shadows: ${output.summary.totalShadows}`);
  console.log(`   Animation: ${output.summary.totalAnimation}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as extractTokens };
