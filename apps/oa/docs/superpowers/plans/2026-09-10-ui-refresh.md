# Modern Workspace UI refresh

Goal: Apply the light, minimal workspace design requested by the user across the existing approval app.
Architecture: Update shared CSS tokens and primitives, then the shell and high-traffic pages. Preserve server actions, permission checks, translations and print layout.
Tech stack: Next.js 15, React 19, Tailwind CSS.

- [x] Refresh global colors, radii, controls, cards, tables, tabs, form-builder surfaces and reduced-motion treatment.
- [x] Refine shared page layouts, sidebar, navigation labels and mobile drawer keyboard behavior.
- [x] Add a localized homepage welcome and linked workload summary; improve catalog cards and search.
- [x] Update request list heading, mobile-friendly filters, request actions and login composition.
- [x] Run TypeScript, existing tests and production build; inspect desktop/mobile rendering when available.

## Light minimal refinement

- White sidebar using shared theme variables, neutral gray canvas, restrained indigo accents.
- Removed hero decoration, dark login panel, colored card borders and lift animations.
- Unified page headings, controls, cards, authentication spacing and native form theme.
- Light is the default for new visitors; an explicitly saved dark preference is preserved.
- Existing working-tree changes were retained and refined. No changes to approval actions or permissions.

## Verification

- TypeScript: passed.
- Existing tests: 112 passed, 0 failed.
- Login visually checked at desktop and 390px mobile width.
- Authenticated routes could not be visually inspected without signing in; their shared components were reviewed in source.
- Production build: passed.

## Remote integration

Merged origin/master changes while preserving conditional fields, question imports, draft actions, template icons, accessibility, and empty-step guidance. The shared request layout remains 60/40, and approval cards retain step titles above member names with actions in the header. Post-merge tests: 164 passed.
