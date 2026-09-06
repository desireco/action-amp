# ActionAmp UI Components

Reusable, design-token-driven components for the ActionAmp webapp.
Every component here is documented live at **`/design-system`**.

> **Rule: every new reusable component MUST be added to `/design-system`.**
> If you build a component and it's not documented there, it doesn't exist.
> This keeps the system discoverable and prevents drift between code and docs.

---

## Inventory

| Component | Purpose | File |
|---|---|---|
| **AuthLayout** | Full-screen calm stage wrapping a single Wasp auth form (login/signup/verify/reset) | `AuthLayout.tsx` + `AuthLayout.css` |
| **BrandMark** | The teal checkmark logo, 3 sizes | `BrandMark.tsx` |
| **Button** | Primary interactive element, 4 variants × 3 sizes | `Button.tsx` + `Button.css` |
| **Card** | Surface container, 4 variants × 4 padding presets | `Card.tsx` + `Card.css` |
| **Chip** | Inline pill (tags, dates, priority, status) | `Chip.tsx` + `Chip.css` |
| **CompletionCircle** | Signature empty→filled toggle, 3 sizes | `CompletionCircle.tsx` + `CompletionCircle.css` |
| **DetailHeaderActions** | Compact action tray for detail page headers | `DetailHeaderActions.tsx` + `DetailHeaderActions.css` |
| **RecordCardGrid** | Responsive grid for record summary cards such as Goals and Projects | `RecordCardGrid.tsx` + `RecordCardGrid.css` |
| **RecordComposer** | Raised create surface for named app records | `RecordComposer.tsx` + `RecordComposer.css` |
| **RecordCreateButton** | Prominent create affordance for first-class records | `RecordCreateButton.tsx` + `RecordCreateButton.css` |
| **InlineEntityEditForm** | Raised in-place edit surface for named app objects | `InlineEntityEditForm.tsx` + `InlineEntityEditForm.css` |
| **PickerSheet** | Bottom-sheet list picker for projects, goals, and destinations | `PickerSheet.tsx` + `PickerSheet.css` |
| **SpecRow** | Compact property row with inline options or picker-backed behavior | `SpecRow.tsx` + `SpecRow.css` |
| **ModeDial** | Bottom-center persistent nav (Plan/Do/Review) | `ModeDial.tsx` + `ModeDial.css` |
| **ZoomDock** | Task/Project/Goal zoom controls | `ZoomDock.tsx` + `ZoomDock.css` |
| **Breadcrumb** | Zoom orientation crumbs (Goal › Project › Task) | `Breadcrumb.tsx` + `Breadcrumb.css` |

All components are barrel-exported from `./index.ts`:

```tsx
import { Button, Card, ModeDial } from "../components/ui";
```

---

## Conventions

### Design tokens, not raw values

Components consume tokens from `src/styles/tokens.css` (`--aa-*`).
Never hardcode hex colors, pixel spacing, or font sizes in a component.
If you need a value that doesn't exist as a token, **add the token first**, then use it.

```css
/* ✅ Good */
background: var(--aa-teal-soft);
padding: var(--aa-space-md);

/* ❌ Bad */
background: #e0f2fe;
padding: 16px;
```

### Naming

- CSS classes use the `aa-<component>` prefix + BEM-style modifiers.
  Example: `aa-dial`, `aa-dial__btn`, `aa-dial__btn--active`.
- React props use camelCase. Variants/sizes are string unions, not booleans.
- Each component ships its own `.css` file co-located with the `.tsx`.

### Accessibility (non-negotiable)

Every interactive component MUST have:

- **`focus-visible` ring** — `outline: 2px solid var(--aa-teal); outline-offset: 2px;`
- **`prefers-reduced-motion`** — disable transitions/animations when requested.
- **ARIA** — `role`, `aria-label`, `aria-pressed`/`aria-selected` where applicable.
- **Keyboard** — operable via Tab + Enter/Space. Clickable non-buttons get `role="button"` + `tabIndex={0}`.

Touch targets for standalone controls should be ≥44×44px. Inline controls (like
the 20px `CompletionCircle` in a list row) are acceptable because adjacent
padding extends the hit area.

### Composition

Components spread `...rest` onto their root element so consumers can pass
`aria-*`, `data-*`, `id`, `onClick`, etc. without thinking:

```tsx
<Card variant="elevated" id="summary" data-testid="plan-card">
```

---

## Usage examples

### AuthLayout

```tsx
import { AuthLayout } from "../components/ui";
import { LoginForm } from "wasp/client/auth";
import { aaAuthAppearance } from "../auth/appearance";

<AuthLayout
  title="Welcome back."
  subtitle="Pick up where you left off."
  footer={<span>New here? <Link to="/signup">Make an account</Link></span>}
>
  <LoginForm {...aaAuthAppearance} />
</AuthLayout>
```

**Use for:** login, signup, email verification, password reset — and ONLY those.
Children must be a Wasp auth form themed via `aaAuthAppearance`. Footer is an
optional flat stack of secondary links.

### Button

```tsx
<Button variant="primary" size="lg">Do this</Button>
<Button variant="secondary">Not now</Button>
<Button variant="ghost" icon={<PlusIcon/>} kbd="⌘K">Capture</Button>
<Button variant="danger" onClick={deleteAccount}>Delete account</Button>
<Button bare>{/* embed inside another component */}</Button>
```

Variants: `primary` (teal CTA), `secondary` (surface + border), `ghost` (text), `danger` (rose).
Sizes: `sm`, `md` (default), `lg`. `bare` strips padding/border for composition.

### Card

```tsx
<Card variant="elevated" padding="lg" header={<h3>Plan</h3>}>
  Content here
</Card>
```

Variants: `default`, `elevated` (shadow, no border), `interactive` (hover lift), `highlighted` (teal glow).
Padding: `none`, `sm`, `md` (default), `lg`.

### Chip

```tsx
<Chip variant="teal">📅 Tomorrow</Chip>
<Chip variant="amber">★ Important</Chip>
<Chip variant="violet" removable onRemove={() => removeTag()}>#work</Chip>
<Chip variant="default" onClick={() => filterBy("today")}>Today</Chip>
```

### ModeDial / ZoomDock / Breadcrumb (navigation cluster)

```tsx
const [mode, setMode] = useState("do");
const [zoom, setZoom] = useState("task");

<ModeDial
  items={[
    { id: "plan",   label: "Plan",   icon: <SunIcon/> },
    { id: "do",     label: "Do",     icon: <PlayIcon/> },
    { id: "review", label: "Review", icon: <MoonIcon/> },
  ]}
  active={mode}
  onSelect={setMode}
/>

<ZoomDock
  items={[
    { id: "goal",    label: "Goal (Z)",    icon: <TargetIcon/> },
    { id: "project", label: "Project",      icon: <BoxIcon/> },
    { id: "task",    label: "Task (X)",    icon: <DotIcon/> },
  ]}
  active={zoom}
  onSelect={setZoom}
/>

<Breadcrumb
  items={[
    { id: "goal",    label: "Grow audience" },
    { id: "project", label: "Ship product v2" },
    { id: "task",    label: "Email Sarah" },
  ]}
  active="task"
  onSelect={(id) => setZoom(id)}
/>
```

---

## When to add a new component

Add to `src/components/ui/` when a pattern appears **3+ times** across pages.
Before adding:

1. Check the prototypes (`docs/mockups/`) — is this already designed?
2. Check `tokens.css` — do you have the tokens you need?
3. Add the component + co-located `.css` + barrel export.
4. **Document it in `/design-system`** (`DesignSystemPage.tsx`) — add a `<Sec>` block.
5. Update this README's Inventory table.
