# Design System Automation

This directory contains automated scripts for discovering components, extracting design tokens, and generating documentation for the ActionAmp design system.

## Overview

The design system automation pipeline consists of four main scripts:

1. **Component Discovery** (`discover-components.js`) - Scans codebase for components and extracts metadata
2. **Token Extraction** (`extract-tokens.js`) - Extracts design tokens from CSS/Tailwind config
3. **Documentation Generation** (`generate-docs.js`) - Generates MDX documentation from extracted data
4. **Validation** (`validate-docs.js`) - Validates documentation consistency

## Quick Start

```bash
# Run the full pipeline
npm run design-system:build

# Run individual steps
npm run design-system:discover  # Scan components
npm run design-system:extract    # Extract tokens
npm run design-system:generate   # Generate docs
npm run design-system:validate   # Validate docs

# Watch for changes (re-run on file changes)
npm run design-system:watch
```

## Scripts

### discover-components.js

Scans the `src/` directory for React/Astro components and extracts:
- Component names and file paths
- Props interfaces with types and defaults
- Component variants (from CVA, enums, etc.)
- Accessibility features (ARIA attributes, keyboard support)
- Usage patterns across the codebase
- Dependencies

**Output:** `design-system-data/component-inventory.json`

```json
{
  "generatedAt": "2025-01-01T00:00:00.000Z",
  "totalComponents": 42,
  "componentsByCategory": {
    "form": ["Button", "Input", "Select"],
    "layout": ["Card", "Container", "Grid"]
  },
  "components": [
    {
      "name": "Button",
      "filePath": "/components/ui/Button.astro",
      "category": "form",
      "props": [
        {
          "name": "variant",
          "type": "string",
          "required": false,
          "default": "default"
        }
      ],
      "variants": ["default", "outline", "ghost"],
      "usageCount": 25
    }
  ]
}
```

### extract-tokens.js

Extracts design tokens from:
- Tailwind CSS `@theme` blocks
- CSS custom properties (`--variables`)
- CSS `:root` definitions

**Output:** `design-system-data/design-tokens.json`

```json
{
  "tokens": {
    "colors": {
      "primary": {
        "value": "#6366f1",
        "type": "color",
        "format": "hex"
      }
    },
    "spacing": {},
    "typography": {},
    "borderRadius": {}
  },
  "taxonomy": {
    "semantic": {},
    "primitive": {},
    "aliases": {}
  }
}
```

### generate-docs.js

Generates Astro/MDX documentation pages from the component inventory and design tokens.

**Output:**
- `src/pages/design-showcase/components.astro` - Components index
- `src/pages/design-showcase/components/[name].astro` - Individual component docs
- `src/pages/design-showcase/design-tokens.astro` - Design tokens documentation

Generated documentation includes:
- Live component previews
- Props tables with types and defaults
- Variant showcases
- Accessibility information
- Usage examples with code snippets
- Related components

### validate-docs.js

Validates documentation consistency and quality:
- ✓ All components have documentation
- ✓ No orphaned documentation files
- ✓ Token references are documented
- ✓ Documentation imports are valid
- ✓ Props have descriptions

**Exit codes:**
- `0` - Validation passed (or passed with warnings)
- `1` - Validation failed with errors

**Output:** `design-system-data/validation-report.json`

```json
{
  "errors": [
    {
      "check": "Undocumented Components",
      "count": 2,
      "details": [
        { "name": "NewComponent", "path": "/components/ui/NewComponent.astro" }
      ]
    }
  ],
  "warnings": [],
  "passed": ["All tokens documented", "All imports valid"]
}
```

## Data Structure

### Component Inventory Schema

```typescript
interface ComponentInventory {
  generatedAt: string;
  totalComponents: number;
  componentsByCategory: Record<string, string[]>;
  components: ComponentMetadata[];
}

interface ComponentMetadata {
  name: string;
  filePath: string;
  category: 'layout' | 'form' | 'navigation' | 'feedback' | 'data-display' | 'other';
  framework: 'react' | 'astro' | 'unknown';
  props: PropDefinition[];
  variants: string[];
  states: string[];
  usageCount: number;
  usageLocations: UsageLocation[];
  dependencies: string[];
  accessibility: AccessibilityInfo;
}

interface PropDefinition {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description: string;
}

interface AccessibilityInfo {
  keyboardSupport: boolean;
  ariaAttributes: string[];
  screenReaderSupport: 'yes' | 'no' | 'unknown';
}
```

### Design Tokens Schema

```typescript
interface DesignTokens {
  generatedAt: string;
  version: string;
  tokens: {
    colors: Record<string, Token>;
    spacing: Record<string, Token>;
    typography: Record<string, Token>;
    borderRadius: Record<string, Token>;
    shadows: Record<string, Token>;
    animation: Record<string, Token>;
  };
  taxonomy: {
    semantic: Record<string, string>;
    primitive: Record<string, string>;
    aliases: Record<string, string>;
  };
  schema: JSONSchema;
  summary: {
    totalColors: number;
    totalSpacing: number;
    // ...
  };
}

interface Token {
  value: string;
  type: string;
  format: 'hex' | 'reference' | 'other';
  description?: string;
}
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/design-system.yml
name: Design System

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run design-system:build
      - run: npm run design-system:validate
```

## File Structure

```
scripts/design-system/
├── README.md                    # This file
├── discover-components.js       # Component discovery script
├── extract-tokens.js            # Token extraction script
├── generate-docs.js             # Documentation generator
├── validate-docs.js             # Validation script
└── watch.js                     # Watch mode (not yet implemented)

design-system-data/              # Generated data (gitignored)
├── component-inventory.json
├── design-tokens.json
└── validation-report.json

src/pages/design-showcase/       # Generated documentation
├── index.astro                  # Design showcase homepage
├── components.astro             # Components index
├── components/
│   ├── button.astro             # Button component docs
│   ├── card.astro               # Card component docs
│   └── ...
└── design-tokens.astro          # Design tokens docs
```

## Component Playground

The `ComponentPlayground.tsx` component provides interactive previews:

```tsx
import { ComponentPlayground } from '@/components/ui/ComponentPlayground';
import { Button } from '@/components/ui/button';

<ComponentPlayground
  component={Button}
  componentName="Button"
  defaultProps={{ variant: 'default', size: 'md' }}
  propSchema={[
    {
      name: 'variant',
      type: 'select',
      options: ['default', 'outline', 'ghost'],
      default: 'default'
    },
    {
      name: 'disabled',
      type: 'boolean',
      default: false
    }
  ]}
/>
```

## Best Practices

1. **Run before committing:** Always run `npm run design-system:build` before committing UI changes
2. **Add prop descriptions:** Document all props in interface definitions for better docs
3. **Use CVA for variants:** Use `class-variance-authority` for variant detection
4. **Follow naming conventions:** Use descriptive component and prop names
5. **Document accessibility:** Add ARIA attributes and keyboard handlers for better detection

## Troubleshooting

### "Component inventory not found"
Run `npm run design-system:discover` first to generate the inventory.

### "Design tokens not found"
Run `npm run design-system:extract` first to extract tokens.

### Validation fails for props without descriptions
Add JSDoc comments to your prop interfaces:

```typescript
interface Props {
  /** The variant of the button */
  variant?: 'default' | 'outline';
  /** Whether the button is disabled */
  disabled?: boolean;
}
```

## Future Enhancements

- [ ] Watch mode for automatic regeneration
- [ ] VS Code extension for inline documentation
- [ ] Figma integration for design token sync
- [ ] Automated accessibility testing
- [ ] Component dependency graphs
- [ ] Usage analytics and recommendations
