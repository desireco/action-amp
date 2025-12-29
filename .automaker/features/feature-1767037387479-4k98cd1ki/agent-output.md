I'll analyze the codebase to understand the structure and create a specification for updating the Capture page design and typography.

🔧 Tool: Glob
Input: {
  "pattern": "**/*capture*"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/*Capture*"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/components/**/*.tsx"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/app/**/*.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/src/pages/capture.astro"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/src/styles/**/*.{css,scss}"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/*.css"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/src/components/ui/Card.astro"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/src/components/ui/Button.astro"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/src/components/ui/LoadingButton.astro"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/src/styles/global.css"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/src/components/ui/card.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/src/components/ui/input.tsx"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/tailwind.config.*"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/tsconfig.json"
}

Now let me check for any existing Playwright tests to understand the testing structure:

🔧 Tool: Glob
Input: {
  "pattern": "**/*.{spec,test,e2e}.{ts,js}"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/playwright.config.{ts,js}"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/tests/**/*"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/package.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/playwright.config.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "tests/**/*.spec.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "e2e/**/*.spec.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/jake/workspace/action-amp/tests/inbox.spec.ts",
  "limit": 50
}

Now I have enough context to create the specification. Let me generate it:

---

## Specification

### 1. Problem
The Capture page currently has a bordered card container and small input fields that reduce readability. The layout doesn't adapt well to different screen sizes, particularly on tablets and mobile devices where users need better spacing and larger touch targets.

### 2. Solution
Remove the border from the capture form container, increase input font sizes to 16-18px for improved readability, and implement responsive width constraints with edge-to-edge layout on mobile/tablet and wider maximum-width container on desktop.

### 3. Acceptance Criteria
- **GIVEN** a user views the Capture page on desktop, **WHEN** the page loads, **THEN** the form container should have no border styling and the container should have a maximum width constraint with proper margins
- **GIVEN** a user views the Capture page on any device, **WHEN** typing in the textarea, **THEN** the font size should be 16-18px for improved readability
- **GIVEN** a user views the Capture page on tablet, **WHEN** the page loads, **THEN** the content should span edge-to-edge with minimal margins
- **GIVEN** a user views the Capture page on mobile, **WHEN** interacting with the form, **THEN** all touch targets should be at least 44px in height
- **GIVEN** a user views the Capture page, **WHEN** viewing type selection buttons, **THEN** they should have consistent borderless styling with proper spacing

### 4. Files to Modify
| File | Purpose | Action |
|------|---------|--------|
| `src/pages/capture.astro` | Main capture page template | Modify |
| `src/components/ui/card.tsx` | Card component with border | Modify |
| `src/components/ui/Card.astro` | Astro card wrapper | Modify |
| `src/components/ui/input.tsx` | Input component styling | Modify |
| `src/components/ui/textarea.tsx` | Textarea component styling | Modify |
| `src/components/ui/ButtonShadcn.tsx` | Button component sizing | Modify |
| `src/components/ui/LoadingButton.astro` | Loading button sizing | Modify |

### 5. Implementation Tasks
```tasks
- [ ] T001: Remove border from Card component in capture.astro | File: src/pages/capture.astro
- [ ] T002: Update textarea font size to 16-18px in capture.astro | File: src/pages/capture.astro
- [ ] T003: Implement responsive width constraints (desktop/tablet/mobile) | File: src/pages/capture.astro
- [ ] T004: Update card.tsx to support borderless variant | File: src/components/ui/card.tsx
- [ ] T005: Update input.tsx base font size to 16px for better readability | File: src/components/ui/input.tsx
- [ ] T006: Update textarea.tsx base font size to 16px and increase min-height | File: src/components/ui/textarea.tsx
- [ ] T007: Update LoadingButton minimum touch target to 44px for mobile | File: src/components/ui/LoadingButton.astro
- [ ] T008: Ensure type selection buttons have proper spacing and touch targets | File: src/pages/capture.astro
```

### 6. Verification
Create a temporary Playwright test to verify:
- Capture page loads without border on form container
- Textarea has computed font-size of 16-18px
- Container width respects responsive breakpoints
- Touch targets are at least 44px on mobile viewport
- Type selection buttons are properly aligned and clickable

[SPEC_GENERATED] Please review the specification above. Reply with 'approved' to proceed or provide feedback for revisions.I'll implement task T001: Remove border from Card component in capture.astro.

Let me first read the current state of the capture.astro file to understand the Card component usage:Now let me check the Card.astro component to understand its structure and how to remove the border:Now let me check the underlying card.tsx component to see how the border is applied:Perfect! I can see that the Card component in `card.tsx` at line 10 has `border` class applied. To remove the border from the Card in capture.astro, I have two options:

1. Add a custom class to override the border
2. Modify the Card component to support borderless variant (but this is task T004)

For task T001 (which is just to remove the border from capture.astro), I'll add the `border-0` or `!border-0` class to override the border. Let me update capture.astro:Perfect! I've successfully implemented task T001. Let me verify the change by reading the updated section:## Task T001 Completed ✅

**Summary:** Successfully removed the border from the Card component in capture.astro.

**Implementation:**
- Added `!border-0` class to the Card component on line 26 of `/Users/jake/workspace/action-amp/src/pages/capture.astro`
- The `!` prefix ensures this overrides the default `border` class from the base Card component in `card.tsx`
- The Card component now renders without a border while maintaining all other styling (padding, shadow, rounded corners)

**Change Made:**
```diff
- <Card class="p-6">
+ <Card class="p-6 !border-0">
```

This is a minimal, targeted fix that only affects the Capture page and doesn't modify the base Card component (which will be addressed in task T004).## Task T001 Completed ✅

**Summary:** Successfully removed the border from the Card component in capture.astro.

**Implementation:**
- Added `!border-0` class to the Card component on line 26 of `/Users/jake/workspace/action-amp/src/pages/capture.astro`
- The `!` prefix ensures this overrides the default `border` class from the base Card component in `card.tsx`
- The Card component now renders without a border while maintaining all other styling (padding, shadow, rounded corners)

**Change Made:**
```diff
- <Card class="p-6">
+ <Card class="p-6 !border-0">
```

This is a minimal, targeted fix that only affects the Capture page and doesn't modify the base Card component (which will be addressed in task T004).I'll focus on task T002: Update textarea font size to 16-18px in capture.astro. Let me first read the file to understand the current implementation.Now I can see the textarea element. Currently, it doesn't have an explicit font size class applied. I need to add a Tailwind class to set the font size to 16-18px. Looking at line 39, the textarea has various classes but no explicit text-size class.

I'll update the textarea to have a font size of 17px (within the 16-18px range) using Tailwind's `text-lg` class which typically maps to 18px, or I can use arbitrary value like `text-[17px]`. Let me use `text-base` (16px) as the minimum acceptable size from the requirement.Perfect! I've successfully updated the textarea font size. The change I made:

## Summary of T002 Implementation

**File Modified:** `src/pages/capture.astro`

**Change Made:**
- Added `text-base` class to the textarea element (line 39)
- This sets the font size to 16px, which is within the required 16-18px range
- The `text-base` Tailwind class maps to 1rem (16px) by default, providing better readability for users entering notes

The textarea now has a proper, readable font size that meets the acceptance criteria for improved readability on the Capture page.Perfect! I've successfully updated the textarea font size. The change I made:

## Summary of T002 Implementation

**File Modified:** `src/pages/capture.astro`

**Change Made:**
- Added `text-base` class to the textarea element (line 39)
- This sets the font size to 16px, which is within the required 16-18px range
- The `text-base` Tailwind class maps to 1rem (16px) by default, providing better readability for users entering notes

The textarea now has a proper, readable font size that meets the acceptance criteria for improved readability on the Capture page.I'll implement task T003: "Implement responsive width constraints (desktop/tablet/mobile)" in src/pages/capture.astro.

Let me first read the current capture.astro file to understand its structure:Now I can see the structure. Currently the page has `max-w-2xl mx-auto` on line 15, which provides a single desktop-centric constraint. I need to implement responsive width constraints for:
- **Mobile**: Edge-to-edge with minimal margins
- **Tablet**: Edge-to-edge with minimal margins  
- **Desktop**: Wider maximum-width container with proper margins

Let me implement the responsive width constraints:Now I need to wrap the Card component in a responsive container:Now I need to close the Card properly and wrap the success message in the same responsive container:Now I need to close the success message div and the responsive wrapper:Perfect! Now let me verify the changes by reading the updated file to ensure the structure is correct:Excellent! The implementation is complete. Let me verify the final structure around the Card closing and success message:Perfect! The implementation is complete. Let me summarize what was implemented for task T003.

---

## ✅ Task T003 Complete: Implement responsive width constraints (desktop/tablet/mobile)

### Summary of Changes

I've successfully implemented responsive width constraints for the Capture page in `src/pages/capture.astro`. The changes create a better user experience across all device sizes:

#### 1. **Main Container Structure** (Line 15)
- Changed from `max-w-2xl mx-auto` to `w-full` for full-width responsive behavior
- This allows edge-to-edge layout on mobile/tablet with controlled margins

#### 2. **Header Section** (Line 16)
- Added responsive padding: `px-4 sm:px-6 lg:px-8`
  - **Mobile (<640px)**: 16px (1rem) horizontal padding
  - **Tablet (640px-1024px)**: 24px (1.5rem) horizontal padding
  - **Desktop (>1024px)**: 32px (2rem) horizontal padding
- Increased max-width from `max-w-2xl` to `max-w-4xl` for better desktop utilization

#### 3. **Card/Form Container** (Lines 26-27)
- Wrapped the Card in responsive padding container: `px-4 sm:px-6 lg:px-8`
- Added responsive padding to the Card itself: `p-4 sm:p-6 lg:p-8`
  - **Mobile**: 16px padding
  - **Tablet**: 24px padding
  - **Desktop**: 32px padding

#### 4. **Success Message** (Line 141)
- Wrapped success message in the same responsive padding container for consistency

### Responsive Behavior

- **Mobile (<640px)**: Edge-to-edge layout with 16px margins, compact 16px card padding
- **Tablet (640px-1024px)**: Edge-to-edge layout with 24px margins, comfortable 24px card padding
- **Desktop (>1024px)**: Centered content with max-width of 896px (max-w-4xl), 32px margins, spacious 32px card padding

The implementation follows Tailwind CSS responsive design patterns and maintains consistency with the existing codebase.Perfect! The implementation is complete. Let me summarize what was implemented for task T003.

---

## ✅ Task T003 Complete: Implement responsive width constraints (desktop/tablet/mobile)

### Summary of Changes

I've successfully implemented responsive width constraints for the Capture page in `src/pages/capture.astro`. The changes create a better user experience across all device sizes:

#### 1. **Main Container Structure** (Line 15)
- Changed from `max-w-2xl mx-auto` to `w-full` for full-width responsive behavior
- This allows edge-to-edge layout on mobile/tablet with controlled margins

#### 2. **Header Section** (Line 16)
- Added responsive padding: `px-4 sm:px-6 lg:px-8`
  - **Mobile (<640px)**: 16px (1rem) horizontal padding
  - **Tablet (640px-1024px)**: 24px (1.5rem) horizontal padding
  - **Desktop (>1024px)**: 32px (2rem) horizontal padding
- Increased max-width from `max-w-2xl` to `max-w-4xl` for better desktop utilization

#### 3. **Card/Form Container** (Lines 26-27)
- Wrapped the Card in responsive padding container: `px-4 sm:px-6 lg:px-8`
- Added responsive padding to the Card itself: `p-4 sm:p-6 lg:p-8`
  - **Mobile**: 16px padding
  - **Tablet**: 24px padding
  - **Desktop**: 32px padding

#### 4. **Success Message** (Line 141)
- Wrapped success message in the same responsive padding container for consistency

### Responsive Behavior

- **Mobile (<640px)**: Edge-to-edge layout with 16px margins, compact 16px card padding
- **Tablet (640px-1024px)**: Edge-to-edge layout with 24px margins, comfortable 24px card padding
- **Desktop (>1024px)**: Centered content with max-width of 896px (max-w-4xl), 32px margins, spacious 32px card padding

The implementation follows Tailwind CSS responsive design patterns and maintains consistency with the existing codebase.I'll implement task T004: Update card.tsx to support borderless variant.

Let me first read the current card.tsx file to understand its structure:Now I'll update the Card component to support a borderless variant. I'll modify the `Card` component to accept a `borderless` prop that will conditionally remove the border styling:Perfect! I've successfully implemented task T004. Here's what I did:

## Summary: Task T004 Completed ✅

**Modified File:** `src/components/ui/card.tsx`

**Changes Made:**
1. **Created a new `CardProps` interface** that extends `React.ComponentProps<"div">` and includes an optional `borderless?: boolean` prop
2. **Updated the `Card` component** to:
   - Accept the `borderless` prop with a default value of `false`
   - Use the new `CardProps` interface for type safety
   - Conditionally apply the `border` class only when `borderless` is `false`
   - Maintain all existing styling (background, rounded corners, shadow, padding)

**How It Works:**
- By default, `<Card />` renders with a border (existing behavior preserved)
- When `<Card borderless />` is used, the border class is omitted, creating a borderless card variant
- This follows Tailwind's conditional class pattern using the `cn()` utility function

**Backward Compatibility:**
- ✅ All existing Card components continue to work as before
- ✅ No breaking changes to the API
- ✅ The borderless variant is opt-in via the new prop

The implementation is complete and ready to be used in the capture.astro file (task T001) by simply adding the `borderless` prop to the Card component.Perfect! I've successfully implemented task T004. Here's what I did:

## Summary: Task T004 Completed ✅

**Modified File:** `src/components/ui/card.tsx`

**Changes Made:**
1. **Created a new `CardProps` interface** that extends `React.ComponentProps<"div">` and includes an optional `borderless?: boolean` prop
2. **Updated the `Card` component** to:
   - Accept the `borderless` prop with a default value of `false`
   - Use the new `CardProps` interface for type safety
   - Conditionally apply the `border` class only when `borderless` is `false`
   - Maintain all existing styling (background, rounded corners, shadow, padding)

**How It Works:**
- By default, `<Card />` renders with a border (existing behavior preserved)
- When `<Card borderless />` is used, the border class is omitted, creating a borderless card variant
- This follows Tailwind's conditional class pattern using the `cn()` utility function

**Backward Compatibility:**
- ✅ All existing Card components continue to work as before
- ✅ No breaking changes to the API
- ✅ The borderless variant is opt-in via the new prop

The implementation is complete and ready to be used in the capture.astro file (task T001) by simply adding the `borderless` prop to the Card component.I'll implement task T005: Update input.tsx base font size to 16px for better readability.

Let me first read the current input.tsx file to understand its structure:Now I can see the current structure. The input currently has `text-base` on mobile and `md:text-sm` on desktop. I need to update the base font size to 16px for better readability. Looking at the class list:

- Current: `text-base` (16px) on mobile, `md:text-sm` (14px) on medium screens and up
- Target: Ensure 16px base font size across all breakpoints for better readability

I'll update the classes to maintain 16px font size:Perfect! Let me verify the change by reading the updated file:## ✅ Task T005 Complete

I've successfully updated the `input.tsx` component to improve readability by ensuring a base font size of 16px.

### What Changed:

**File Modified:** `src/components/ui/input.tsx`

**Change Made:** Removed the `md:text-sm` responsive class that was reducing the font size on desktop screens (768px and above).

- **Before:** `text-base` (16px) on mobile, then `md:text-sm` (14px) on medium+ screens
- **After:** `text-base` (16px) consistently across all screen sizes

### Why This Matters:

1. **Better Readability:** 16px font size is more comfortable to read than 14px, especially for forms
2. **Accessibility:** Improved readability for users with visual impairments
3. **Consistent Sizing:** The input component now maintains a readable size across all breakpoints
4. **Mobile Optimization:** Keeping 16px also prevents iOS zoom-on-focus behavior (which triggers on fonts smaller than 16px)

The component retains all other styling features including focus states, disabled states, error states, and file input styling.## ✅ Task T005 Complete

I've successfully updated the `input.tsx` component to improve readability by ensuring a base font size of 16px.

### What Changed:

**File Modified:** `src/components/ui/input.tsx`

**Change Made:** Removed the `md:text-sm` responsive class that was reducing the font size on desktop screens (768px and above).

- **Before:** `text-base` (16px) on mobile, then `md:text-sm` (14px) on medium+ screens
- **After:** `text-base` (16px) consistently across all screen sizes

### Why This Matters:

1. **Better Readability:** 16px font size is more comfortable to read than 14px, especially for forms
2. **Accessibility:** Improved readability for users with visual impairments
3. **Consistent Sizing:** The input component now maintains a readable size across all breakpoints
4. **Mobile Optimization:** Keeping 16px also prevents iOS zoom-on-focus behavior (which triggers on fonts smaller than 16px)

The component retains all other styling features including focus states, disabled states, error states, and file input styling.I'll focus on task T006: updating the textarea.tsx component with a 16px base font size and increased min-height.

Let me first read the current textarea.tsx file to understand its structure:Perfect! I can see the textarea component. Now I'll update it with:
1. Base font size of 16px (currently it uses `text-base` which varies, and `md:text-sm` on desktop)
2. Increased min-height (currently `min-h-16` which is 64px)

Let me make the update:Perfect! Let me verify the complete updated file:## ✅ Task T006 Completed

I've successfully updated the `textarea.tsx` component with the following changes:

### Changes Made:

1. **Base font size updated to 16px**: Changed from `text-base` (which varies) and `md:text-sm` to a fixed `text-[16px]` for consistent, better readability across all screen sizes.

2. **Increased min-height**: Changed from `min-h-16` (64px) to `min-h-32` (128px), providing more initial space for content entry and a better user experience.

3. **Removed responsive font size override**: Removed the `md:text-sm` class that was making the text smaller on desktop screens, ensuring consistent 16px font size across all devices.

### Benefits:
- Consistent 16px font size prevents iOS auto-zoom on focus
- Larger min-height gives users more comfortable typing space
- Better readability and accessibility across all devices
- Maintains all existing styling (borders, focus states, transitions, etc.)

The textarea component now aligns with the earlier changes made to `input.tsx` (T005) and provides a better user experience for the Capture page form.## ✅ Task T006 Completed

I've successfully updated the `textarea.tsx` component with the following changes:

### Changes Made:

1. **Base font size updated to 16px**: Changed from `text-base` (which varies) and `md:text-sm` to a fixed `text-[16px]` for consistent, better readability across all screen sizes.

2. **Increased min-height**: Changed from `min-h-16` (64px) to `min-h-32` (128px), providing more initial space for content entry and a better user experience.

3. **Removed responsive font size override**: Removed the `md:text-sm` class that was making the text smaller on desktop screens, ensuring consistent 16px font size across all devices.

### Benefits:
- Consistent 16px font size prevents iOS auto-zoom on focus
- Larger min-height gives users more comfortable typing space
- Better readability and accessibility across all devices
- Maintains all existing styling (borders, focus states, transitions, etc.)

The textarea component now aligns with the earlier changes made to `input.tsx` (T005) and provides a better user experience for the Capture page form.I'll implement task T007 to update the LoadingButton minimum touch target to 44px for mobile. Let me first read the LoadingButton component to understand its current structure.Now let me check the Button.astro component to see how it handles sizing and understand the pattern:Now let me check the ButtonShadcn component to understand how it handles sizing:Now let me check the base button.tsx from shadcn to see the size classes:Perfect! Now I understand the structure. I can see that:

1. The shadcn button uses `h-9` (36px), `h-8` (32px), and `h-10` (40px) for its sizes
2. The LoadingButton component uses `py-2` (8px top + 8px bottom = 16px) plus line-height for its height
3. For mobile touch targets, we need a minimum of 44px

The LoadingButton currently has `px-4 py-2` but no explicit height class. I need to add a minimum height of 44px to ensure proper touch targets on mobile. I'll use the `min-h-[44px]` Tailwind class to ensure the button meets mobile touch target requirements while maintaining flexibility for larger sizes.

Let me update the LoadingButton.astro file:I need to replace both occurrences (the `<a>` tag and the `<button>` tag). Let me use replace_all:Perfect! Let me verify the change by reading the updated file:Excellent! The changes have been successfully applied. Let me summarize what was implemented:

---

## ✅ Task T007 Completed

### Summary
Successfully updated the **LoadingButton** component to meet mobile touch target requirements by adding a minimum height of 44px.

### Changes Made
**File:** `src/components/ui/LoadingButton.astro`

**Modification:** Added `min-h-[44px]` Tailwind class to both the `<button>` and `<a>` tag class lists (lines 49 and 63).

**Before:**
```astro
class={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg ...`}
```

**After:**
```astro
class={`inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg ...`}
```

### Implementation Details
- **Mobile Touch Target Compliance:** The 44px minimum height meets WCAG 2.1 Success Criterion 2.5.5 (Target Size) and Apple's Human Interface Guidelines for touch targets
- **Applied to Both Variants:** Updated both `<button>` and `<a>` tag implementations to ensure consistency regardless of whether an `href` is provided
- **Flexible Design:** Using `min-h-` instead of `h-` ensures the button can grow larger for content while maintaining the minimum touch target size
- **Pattern Consistency:** Follows Tailwind CSS patterns used elsewhere in the codebase

### Testing Recommendation
The LoadingButton component should be tested on mobile viewports to verify:
1. Touch targets are at least 44px in height
2. Button content remains properly centered with the increased minimum height
3. Loading state displays correctly with the new sizingExcellent! The changes have been successfully applied. Let me summarize what was implemented:

---

## ✅ Task T007 Completed

### Summary
Successfully updated the **LoadingButton** component to meet mobile touch target requirements by adding a minimum height of 44px.

### Changes Made
**File:** `src/components/ui/LoadingButton.astro`

**Modification:** Added `min-h-[44px]` Tailwind class to both the `<button>` and `<a>` tag class lists (lines 49 and 63).

**Before:**
```astro
class={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg ...`}
```

**After:**
```astro
class={`inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg ...`}
```

### Implementation Details
- **Mobile Touch Target Compliance:** The 44px minimum height meets WCAG 2.1 Success Criterion 2.5.5 (Target Size) and Apple's Human Interface Guidelines for touch targets
- **Applied to Both Variants:** Updated both `<button>` and `<a>` tag implementations to ensure consistency regardless of whether an `href` is provided
- **Flexible Design:** Using `min-h-` instead of `h-` ensures the button can grow larger for content while maintaining the minimum touch target size
- **Pattern Consistency:** Follows Tailwind CSS patterns used elsewhere in the codebase

### Testing Recommendation
The LoadingButton component should be tested on mobile viewports to verify:
1. Touch targets are at least 44px in height
2. Button content remains properly centered with the increased minimum height
3. Loading state displays correctly with the new sizingI'll implement task T008 to ensure type selection buttons have proper spacing and touch targets. Let me first examine the current implementation in capture.astro.Now I can see the type selection buttons on lines 52-110. Currently they have:
- `px-3 py-2` which provides 12px padding horizontally and 8px padding vertically
- Small `text-sm` font size
- No minimum touch target size defined

For proper mobile touch targets (44px minimum height per WCAG and iOS guidelines), I need to increase the padding. Let me update these buttons:Let me check the exact whitespace in the file by reading it again more carefully:I see - the "note" option has `checked` on line 73. Let me update each button individually to ensure proper spacing and touch targets. I'll start with the container gap:Good! Now let me update the Action button:Great! Now let me update the Note button (which has the `checked` attribute):Now let me update the Link button:Finally, let me update the Idea button:Perfect! Let me verify the changes by reading the updated section:Excellent! Task T008 is now complete. Here's a summary of what was implemented:

---

## ✅ Task T008 Complete: Type Selection Buttons - Spacing and Touch Targets

### Changes Made to `src/pages/capture.astro`

**Updated all 4 type selection buttons** (Action, Note, Link, Idea) with the following improvements:

#### 1. **Minimum Touch Target Size (44px)**
   - Added `min-h-[44px]` to meet WCAG and iOS accessibility guidelines
   - Ensures buttons are easily tappable on mobile devices

#### 2. **Increased Padding**
   - Changed from `px-3 py-2` (12px × 8px) to `px-4 py-3` (16px × 12px)
   - Provides more comfortable touch targets and better visual spacing

#### 3. **Responsive Sizing**
   - Container gap: `gap-3 sm:gap-4` (more space on larger screens)
   - Icon gap: `gap-2 sm:gap-3` (better spacing on desktop)
   - Icon sizes: `w-4 h-4 sm:w-5 sm:h-5` (larger icons on desktop)
   - Text sizes: `text-sm sm:text-base` (more readable on larger screens)

#### 4. **Enhanced Interactions**
   - Added `hover:bg-background/80` for better hover feedback
   - Added `active:scale-[0.98]` for tactile press feedback
   - Added `touch-manipulation` to optimize touch behavior on mobile devices

### Benefits
- ✅ Meets 44px minimum touch target requirement for mobile
- ✅ Better visual hierarchy with increased spacing
- ✅ Improved responsive design across mobile, tablet, and desktop
- ✅ Enhanced accessibility with clearer interactive feedbackExcellent! Task T008 is now complete. Here's a summary of what was implemented:

---

## ✅ Task T008 Complete: Type Selection Buttons - Spacing and Touch Targets

### Changes Made to `src/pages/capture.astro`

**Updated all 4 type selection buttons** (Action, Note, Link, Idea) with the following improvements:

#### 1. **Minimum Touch Target Size (44px)**
   - Added `min-h-[44px]` to meet WCAG and iOS accessibility guidelines
   - Ensures buttons are easily tappable on mobile devices

#### 2. **Increased Padding**
   - Changed from `px-3 py-2` (12px × 8px) to `px-4 py-3` (16px × 12px)
   - Provides more comfortable touch targets and better visual spacing

#### 3. **Responsive Sizing**
   - Container gap: `gap-3 sm:gap-4` (more space on larger screens)
   - Icon gap: `gap-2 sm:gap-3` (better spacing on desktop)
   - Icon sizes: `w-4 h-4 sm:w-5 sm:h-5` (larger icons on desktop)
   - Text sizes: `text-sm sm:text-base` (more readable on larger screens)

#### 4. **Enhanced Interactions**
   - Added `hover:bg-background/80` for better hover feedback
   - Added `active:scale-[0.98]` for tactile press feedback
   - Added `touch-manipulation` to optimize touch behavior on mobile devices

### Benefits
- ✅ Meets 44px minimum touch target requirement for mobile
- ✅ Better visual hierarchy with increased spacing
- ✅ Improved responsive design across mobile, tablet, and desktop
- ✅ Enhanced accessibility with clearer interactive feedback