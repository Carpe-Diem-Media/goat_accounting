---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces for Divine Detail (SvelteKit on Cloudflare Pages) with high design quality and zero generic AI aesthetics. Use this skill whenever building UI components, pages, layouts, styles, or interactions.
license: Complete terms in LICENSE.txt
---

# Divine Detail Frontend Design Skill (SvelteKit + Tailwind v4 + shadcn-svelte)

This skill guides creation of distinctive, production-grade frontend interfaces for **Divine Detail** that avoid generic “AI slop” aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## Project Context (Truths you must not violate)

**Platform**
- Framework: SvelteKit 2 + Svelte 5 (runes API in use; `$props()` etc.)
- Deployment: Cloudflare Pages using `@sveltejs/adapter-cloudflare`
- Runtime: Cloudflare Workers/Pages Functions (`nodejs_compat` flag enabled)
- Tooling: Bun, Vite 7
- Styling: Tailwind CSS v4 via `@tailwindcss/vite` (CSS-first; no tailwind.config.* by default)
- Design tokens: CSS variables + Tailwind v4 `@theme inline` tokens (already present in `layout.css`)
- UI library: shadcn-svelte available (components.json configured; TypeScript true)
- Icons: `@lucide/svelte`
- Utilities: `cn()` helper (`utils.ts`) using clsx + tailwind-merge

**Brand Palette (non-negotiable)**
- Primary: `#d68e85` (accent / CTA / highlight)
- Dark/background: `#211e1e` (foundation / depth / luxury)

**Brand position**
- “Luxury-refined, warm, grounded” is the default direction unless the user requests otherwise.

## Design Thinking (MANDATORY before coding)

Before writing code, do a short internal plan and then execute. Commit to a BOLD aesthetic direction:
- **Purpose**: What page/component is being built? Who is it for (bridal makeup, Pretoria/Gauteng)?
- **Tone**: Choose one extreme and own it: luxury/editorial, brutal minimal, soft romantic, art deco geometric, etc.
- **Constraints**: Cloudflare Pages, SvelteKit, performance, accessibility.
- **Differentiation**: Define a single “signature moment” the user will remember (e.g. a hero layout, texture system, motion reveal, typographic treatment).

**CRITICAL**: Intentionality beats intensity. Pick a direction and execute precisely.

## Divine Detail Design Laws (Hard Rules)

### 1) Palette usage
- Use `#211e1e` (and its derived neutrals) as the dominant backdrop. This is a luxury site—depth matters.
- Use `#d68e85` as a controlled accent: buttons, links, highlights, badges. Avoid full-page pink washes.
- Always ensure **WCAG AA contrast** for text.

### 2) Tokens first, not ad-hoc styles
- Prefer existing `layout.css` tokens and Tailwind `@theme inline` mappings.
- If a new token is needed, add it deliberately (CSS variables + `@theme inline`) rather than hard-coding random hex values.

### 3) shadcn-svelte is the component baseline
- Use shadcn-svelte components where appropriate (Button, Card, Sheet, DropdownMenu, Input, Textarea, Label, Badge, Separator, Accordion/Tabs/Table).
- Keep custom components consistent with shadcn patterns and tokens.

### 4) Typography must be distinctive (no generic defaults)
- Avoid generic system fonts (Arial, Roboto, plain "system" stacks). Source Sans 3 is the adopted project body font; do not replace it without deliberate reason.
- Keep a distinctive display font (Cormorant Garamond) for headlines.
- **Current Divine Detail font pairing:**
  - `--font-display`: Cormorant Garamond (headlines, hero text, section titles)
  - `--font-sans`: Source Sans 3 (body, UI, navigation)
- Fonts are loaded via Google Fonts in `app.html` and mapped to Tailwind tokens in `layout.css` (`@theme inline`).
- **If changing fonts, do it deliberately and update `app.html` + tokens together.**
- Typography should feel editorial and premium (intentional sizes, line heights, letter-spacing).

### 5) Motion: one signature sequence beats lots of noise
- Prioritize one orchestrated load reveal (staggered, subtle, elegant).
- Add micro-interactions where they matter: CTA hover, nav transitions, card focus.
- Respect reduced motion (`prefers-reduced-motion`).

### 6) Composition: avoid cookie-cutter layouts
- Use asymmetry, overlap, controlled negative space, grid-breaking details.
- Add atmosphere: subtle grain/noise, soft gradients, layered borders, or decorative rules—always aligned with the chosen aesthetic.

### 7) Semantic HTML + accessibility are not optional
- Use `<main>`, `<section>`, `<article>`, proper heading hierarchy.
- Forms must have labels, error states, focus rings, keyboard navigation.
- Images must have intentional alt text (local SEO-friendly when appropriate).

### 8) Performance discipline
- Lazy-load images, use responsive images where possible.
- Minimize JS bloat; prefer CSS for visual effects.
- Keep Core Web Vitals strong; Cloudflare doesn’t save you from bad frontend decisions.

## Output Requirements (What you must produce)

When the user asks for UI work:
1) **State the chosen aesthetic direction** in one sentence.
2) **List the components/files you will create or modify** (concrete paths).
3) Provide **working SvelteKit code** (not pseudocode).
4) Ensure:
   - tokens used (no random colors)
   - light/dark behavior (if theme exists)
   - hover/focus/active states
   - accessibility considerations
   - mobile-first responsiveness
5) If adding shadcn-svelte components, include the exact install/generate commands and the files they touch.

## Divine Detail Defaults (use unless overridden)

**Brand vibe defaults**
- Luxury / refined / warm / editorial.
- Dark theme-first with a clean, bright “paper” surface option where needed.

**Common page goals**
- Local SEO dominance: Pretoria + Gauteng + surrounding areas (e.g., Vanderbijlpark).
- EEAT signals: testimonials, galleries, clear contact details, service transparency.

## Anti-Slop Checklist (Fail the work if any are true)

- Uses generic fonts (Roboto/system-only stacks) or replaces the established Source Sans 3 + Cormorant Garamond pairing without deliberate reason.
- Uses generic purple gradients or template-y hero sections.
- Repeats “SaaS landing page” layout clichés.
- Hardcodes random colors instead of tokens.
- No focus states / no semantic structure / poor mobile layout.
- “Looks nice” but is not functional code.

---

Use this skill whenever building or refining any Divine Detail UI: layout shell, navigation, components, pages, forms, galleries, or interactions.
