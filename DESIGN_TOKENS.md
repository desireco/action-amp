# ActionAmp Design Tokens

This document provides a comprehensive reference for all design tokens used in the ActionAmp application. These tokens are defined in the Tailwind CSS configuration and should be used consistently throughout the application.

## Table of Contents

- [Color System](#color-system)
- [Typography](#typography)
- [Spacing](#spacing)
- [Border Radius](#border-radius)
- [Shadows & Elevation](#shadows--elevation)
- [Animation](#animation)
- [Accessibility](#accessibility)

## Color System

### Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#6366f1` | Primary actions, links, brand elements |
| `primary-foreground` | `#ffffff` | Text on primary backgrounds |

### Neutral Palette (Zinc)

| Token | Hex | Usage | Notes |
|-------|-----|-------|-------|
| `background` | `#09090b` | Main application background | Zinc 950 |
| `surface` | `#18181b` | Cards, panels, elevated surfaces | Zinc 900 |
| `surface-hover` | `#27272a` | Hover states for surfaces | Zinc 800 |
| `accent` | `#27272a` | Accent backgrounds, highlighted areas | Zinc 800 |
| `accent-foreground` | `#fafafa` | Text on accent backgrounds | Zinc 50 |
| `border` | `#27272a` | Dividers, input borders | Zinc 800 |

### Secondary Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `secondary` | `#27272a` | Secondary buttons, less prominent elements |
| `secondary-foreground` | `#fafafa` | Text on secondary backgrounds |

### Text Colors

| Token | Hex | Usage | Notes |
|-------|-----|-------|-------|
| `text-main` | `#fafafa` | Primary text, headings | Zinc 50 |
| `text-muted` | `#a1a1aa` | Secondary text, descriptions | Zinc 400 |

### Semantic Colors

| Token | Hex | Usage | Notes |
|-------|-----|-------|-------|
| `destructive` | `#ef4444` | Errors, destructive actions | Red 500 |
| `destructive-foreground` | `#ffffff` | Text on destructive backgrounds |
| `success` | `#22c55e` | Success states, confirmations | Green 500 |
| `warning` | `#eab308` | Warnings, cautions | Yellow 500 |
| `info` | `#3b82f6` | Information, notifications | Blue 500 |

### Color Usage Guidelines

1. **Primary**: Use for main CTAs, important interactive elements, and brand representation
2. **Secondary**: Use for secondary actions, alternate buttons, and less prominent elements
3. **Background/Surface**: Use to create hierarchy and depth in the interface
4. **Destructive**: Use only for actions that can't be undone (delete, remove, etc.)
5. **Success/Warning/Info**: Use for status indicators and feedback messages
6. **Text Colors**: Always ensure sufficient contrast (4.5:1 for normal text, 3:1 for large text)

## Typography

### Font Stack

```css
--font-sans: 'Inter', system-ui, sans-serif
```

Inter is used for all UI text. It provides excellent readability at all sizes and supports multiple weights.

### Type Scale

| Class | Size (rem) | Size (px) | Line Height | Font Weight |
|-------|------------|-----------|-------------|-------------|
| `text-xs` | 0.75 | 12px | 1rem (16px) | 400 |
| `text-sm` | 0.875 | 14px | 1.25rem (20px) | 400 |
| `text-base` | 1 | 16px | 1.5rem (24px) | 400 |
| `text-lg` | 1.125 | 18px | 1.75rem (28px) | 400 |
| `text-xl` | 1.25 | 20px | 1.75rem (28px) | 400 |
| `text-2xl` | 1.5 | 24px | 2rem (32px) | 400 |
| `text-3xl` | 1.875 | 30px | 2.25rem (36px) | 400 |
| `text-4xl` | 2.25 | 36px | 2.5rem (40px) | 300 |
| `text-5xl` | 3 | 48px | 1 | 300 |
| `text-6xl` | 3.75 | 60px | 1 | 300 |
| `text-7xl` | 4.5 | 72px | 1 | 300 |
| `text-8xl` | 6 | 96px | 1 | 300 |
| `text-9xl` | 8 | 128px | 1 | 300 |

### Font Weights

| Class | Weight | Name |
|-------|--------|------|
| `font-thin` | 100 | Thin |
| `font-extralight` | 200 | Extra Light |
| `font-light` | 300 | Light |
| `font-normal` | 400 | Regular |
| `font-medium` | 500 | Medium |
| `font-semibold` | 600 | Semibold |
| `font-bold` | 700 | Bold |
| `font-extrabold` | 800 | Extra Bold |
| `font-black` | 900 | Black |

## Spacing

### Spacing Scale

Based on a 4px (0.25rem) base unit.

| Class | rem | px |
|-------|-----|----|
| `p-0` | 0 | 0px |
| `p-px` | 0.0625 | 1px |
| `p-0.5` | 0.125 | 2px |
| `p-1` | 0.25 | 4px |
| `p-1.5` | 0.375 | 6px |
| `p-2` | 0.5 | 8px |
| `p-2.5` | 0.625 | 10px |
| `p-3` | 0.75 | 12px |
| `p-3.5` | 0.875 | 14px |
| `p-4` | 1 | 16px |
| `p-5` | 1.25 | 20px |
| `p-6` | 1.5 | 24px |
| `p-7` | 1.75 | 28px |
| `p-8` | 2 | 32px |
| `p-9` | 2.25 | 36px |
| `p-10` | 2.5 | 40px |
| `p-12` | 3 | 48px |
| `p-14` | 3.5 | 56px |
| `p-16` | 4 | 64px |
| `p-20` | 5 | 80px |
| `p-24` | 6 | 96px |

### Common Spacing Patterns

- Component padding: `p-4` (16px)
- Section spacing: `space-y-8` (32px)
- Gap between elements: `gap-2` to `gap-4` (8px to 16px)
- Margin between sections: `my-6` (24px)

## Border Radius

### Corner Radius Scale

The default border radius is 0.5rem (8px). Use consistently for rounded elements.

| Class | rem | px | Notes |
|-------|-----|----|-------|
| `rounded-none` | 0 | 0px | No radius |
| `rounded-sm` | 0.125 | 2px | Small radius |
| `rounded` | 0.5 | 8px | Default radius |
| `rounded-md` | 0.375 | 6px | Medium radius |
| `rounded-lg` | 0.5 | 8px | Large radius |
| `rounded-xl` | 0.75 | 12px | Extra large radius |
| `rounded-2xl` | 1 | 16px | 2x large radius |
| `rounded-3xl` | 1.5 | 24px | 3x large radius |
| `rounded-full` | 9999 | 9999px | Fully rounded |

## Shadows & Elevation

### Shadow Scale

| Class | Usage |
|-------|-------|
| `shadow-none` | No shadow |
| `shadow-sm` | Subtle elevation |
| `shadow` | Default shadow |
| `shadow-md` | Medium elevation |
| `shadow-lg` | Large elevation |
| `shadow-xl` | Extra large elevation |
| `shadow-2xl` | 2x large elevation |
| `shadow-inner` | Inset shadow |

## Animation

### Motion Guidelines

Animations should be subtle and purposeful. Respect user preferences for reduced motion.

### Transition Properties

| Class | Usage |
|-------|-------|
| `transition-colors` | Color changes |
| `transition-opacity` | Fade in/out |
| `transition-transform` | Movement |
| `transition-all` | All properties |

### Duration Classes

| Class | Duration | Usage |
|-------|----------|-------|
| `duration-75` | 75ms | Instant transitions |
| `duration-150` | 150ms | Fast transitions |
| `duration-300` | 300ms | Standard transitions |
| `duration-500` | 500ms | Slow transitions |

## Accessibility

### WCAG 2.1 AA Compliance

#### Color Contrast
All text meets or exceeds WCAG AA contrast ratios:
- Normal text: 4.5:1 minimum
- Large text (18px+): 3:1 minimum
- Interactive elements: 3:1 minimum

#### Focus States
All interactive elements have visible focus indicators with:
- 2px solid outline with 2px offset
- High contrast mode support (3px outline)
- Visible on both light and dark backgrounds

#### Reduced Motion
Respects `@media (prefers-reduced-motion)` for users who prefer reduced motion.

## Usage in Components

When creating new components, always use the design tokens rather than hard-coding values:

```html
<!-- ✅ Good: Using design tokens -->
<div class="bg-surface p-4 rounded-lg border border-border">
  <h2 class="text-xl font-semibold text-text-main mb-2">Title</h2>
  <p class="text-sm text-text-muted">Description text</p>
</div>

<!-- ❌ Bad: Hard-coded values -->
<div style="background: #18181b; padding: 16px; border-radius: 8px; border: 1px solid #27272a;">
  <h2 style="font-size: 20px; font-weight: 600; color: #fafafa; margin-bottom: 8px;">Title</h2>
  <p style="font-size: 14px; color: #a1a1aa;">Description text</p>
</div>
```

## File Locations

- Design tokens are defined in: `src/styles/global.css`
- Design tokens documentation: `src/pages/design-showcase/design-tokens.astro`
- Component examples: `src/pages/design-showcase/components.astro`

## Contributing

When adding new design tokens:
1. Add them to `src/styles/global.css`
2. Update this documentation
3. Add examples to the design showcase if applicable
4. Ensure WCAG 2.1 AA compliance for any new colors