# shadcn/ui Setup in ActionAmp

This document explains how shadcn/ui is integrated into the ActionAmp project and how to use it effectively.

## What's Installed

### Core Dependencies
- `class-variance-authority` - For component variants
- `clsx` - Conditional class names
- `tailwind-merge` - Merge Tailwind CSS classes
- `tailwindcss-animate` - Animation utilities
- `@radix-ui/react-slot` - Headless UI primitives
- `@radix-ui/react-label` - Accessible label component

### Configuration Files
- `components.json` - shadcn/ui configuration
- `src/lib/utils.ts` - Utility functions including `cn()` for class merging

### Available Components
- `Button` - Fully featured button component with variants
- `Card` - Card container component
- `Input` - Input field component
- `Label` - Accessible label component

## How It's Integrated

### Color System
shadcn/ui is configured to use ActionAmp's existing color palette:
- `--primary` maps to ActionAmp's primary color (#6366f1)
- `--secondary` maps to ActionAmp's secondary color (#27272a)
- `--background` maps to ActionAmp's background (#09090b)
- `--foreground` maps to ActionAmp's text-main (#fafafa)
- `--muted` maps to ActionAmp's surface-hover (#27272a)
- `--destructive` maps to ActionAmp's destructive (#ef4444)

### Path Aliases
The project is configured with the following path aliases:
- `@/*` → `./src/*`
- `@/components/*` → `./src/components/*`
- `@/lib/*` → `./src/lib/*`

## Using shadcn/ui Components

### Example Usage in Astro

```astro
---
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
---

<Card class="p-6">
  <form class="space-y-4">
    <div>
      <Label for="email">Email</Label>
      <Input id="email" type="email" placeholder="Enter your email" />
    </div>
    <Button type="submit">Submit</Button>
  </form>
</Card>
```

### Button Variants

```tsx
// Default button
<Button>Click me</Button>

// Different variants
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>
<Button variant="link">Learn more</Button>

// Different sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">🔥</Button>
```

## Adding New Components

To add new shadcn/ui components:

```bash
npx shadcn@latest add [component-name]
```

Examples:
```bash
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add table
npx shadcn@latest add toast
```

## Customization

### Overriding Component Styles
You can extend or override component styles using the `className` prop:

```tsx
<Button className="w-full">Full width button</Button>
<Button className="bg-custom-color hover:bg-custom-color-hover">Custom styled</Button>
```

### Creating Custom Variants
Use `class-variance-authority` (CVA) to create custom component variants:

```tsx
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const customVariants = cva(
  "base-styles",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);
```

## Important Notes

1. **Dark Mode**: While shadcn/ui supports dark mode out of the box, ActionAmp currently uses a dark-first design. The dark mode class is available but not actively used.

2. **TailwindCSS v4**: shadcn/ui is configured to work with TailwindCSS v4, which ActionAmp uses.

3. **TypeScript**: All components are fully typed with TypeScript.

4. **Accessibility**: shadcn/ui components are built on Radix UI primitives and include proper ARIA attributes and keyboard navigation.

5. **Custom Components**: The existing ActionAmp components (e.g., `src/components/ui/Button.astro`) can gradually be migrated to shadcn/ui or continue to coexist.

## Migration Guide

When migrating existing Astro components to shadcn/ui React components:

1. Import the React component from `@/components/ui`
2. Update props to match the new component API
3. Convert Astro syntax to React/JSX
4. Test thoroughly, especially accessibility features

Example migration:
```astro
<!-- Old Astro component -->
---
import Button from "./ui/Button.astro";
---
<Button href="/page" variant="primary">Click me</Button>
```

```tsx
// New shadcn/ui component
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation"; // or Astro navigation

export function MyComponent() {
  return (
    <Button onClick={() => navigate("/page")} variant="primary">
      Click me
    </Button>
  );
}
```

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Radix UI](https://www.radix-ui.com/)
- [TailwindCSS v4 Documentation](https://tailwindcss.com/blog/tailwindcss-v4-alpha)