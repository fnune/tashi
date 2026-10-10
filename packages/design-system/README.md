# Tashi design system

Tashi (足し, "adding") is a diabetes macro calculator with bolus suggestions. The app is in Spanish. This folder is the source of truth for how it looks, reads and behaves. Visual direction: **Air**. Palette: **Sumi** (ink neutrals) with the **Sora** (空, sky) accent from the logo. Typeface: **Open Sans**. Lists use light dividers (variant B2).

> Status: v0.1, a foundation. Tokens, principles and the components on the three existing screens (Calcular, Historial, Ajustes) are specified. Everything listed in `docs/decisions.md` → *Open work* is not designed yet.

## Principles (the calm app)

The app is built to feel calm: simple, clear, predictable, respectful of user agency. Carry this through to the code, the copy, the defaults and the failure paths.

- **Simplicity is the default.** A feature earns its place or it does not ship.
- **Clarity over cleverness.** Plain copy, ordinary words, predictable defaults.
- **Every interaction is calm.** No dark patterns. No shame buttons ("Aceptar" / "Quizás más tarde"). No ads. No nagging.
- **Respect user agency.** The user is in control. We do not coerce, guilt, or hide options.
- **Failures are shown calmly.** Error messages are accurate, plain, and never blame the user.
- **Notifications earn the interruption** or they do not happen.

How Air expresses this visually:

1. **Space groups things, not boxes.** No cards, no borders around sections. Sections are separated by 40 px of space and a plain heading. The one exception: rows of long lists (Historial, Ajustes) get a light 1 px divider in `line` so they scan easily.
2. **One number leads each screen.** The current glucose on Calcular, the dose on the result. Big, bold, tabular.
3. **Colour means something.** Neutrals carry the UI. Sora marks the one main action, selection and focus. Status colours (glucose, insulin, warnings) are never decoration.
4. **Interactive things have a fill.** Chips, segments, inputs and tiles sit on `fill`. Static content sits on `bg`. Selection is a solid fill (accent or inverse), never only a border.
5. **Nothing relies on colour alone.** Every state also has text or an icon.

## Files

| Path | What it is |
|---|---|
| `tokens/tokens.json` | All design tokens in W3C DTCG format. Edit this, nothing else, to change a value. |
| `tokens/tokens.css` | CSS custom properties generated from the JSON (light, dark via `prefers-color-scheme`, forced via `data-theme`). |
| `docs/components.md` | Every component: anatomy, tokens, states, accessibility, copy. |
| `docs/content.md` | Voice, Spanish copy rules, number and unit formatting, error and empty-state patterns. |
| `docs/accessibility.md` | Requirements and the generated contrast table. |
| `docs/decisions.md` | Why things are the way they are, rejected options, open questions, open work. |
| `reference/air-reference.html` | Interactive mockup of the three screens. Variant **B2** with **Open Sans** and **Sora** is canonical. Use the switches at the top to see it. Open it in a browser. |
| `scripts/build-css.mjs` | `node scripts/build-css.mjs` regenerates `tokens.css`. |
| `scripts/check-contrast.mjs` | `node scripts/check-contrast.mjs` checks every colour pair in both themes; exits 1 on failure. |
| `logo/` | The logo and app icons, generated from the Sora primitives by `logo/generate.py`. See `logo/README.md`. |
| `CLAUDE.md` | Instructions for coding agents working on this system. |

## In this repository

This folder is the `@pincho/design-system` workspace package. The app imports `@pincho/design-system/tokens.css` and builds on its roles; nothing here depends on the app, so it can be explored on its own (open `reference/air-reference.html`).

- `pnpm --filter @pincho/design-system build` regenerates `tokens.css`.
- `pnpm --filter @pincho/design-system check:contrast` checks contrast.
- `nix develop -c pnpm --filter @pincho/design-system logo` regenerates the logo and the app's icons.

## Using the tokens (web)

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="tokens/tokens.css">
```

```css
body { background: var(--color-bg); color: var(--color-fg); font-family: var(--font-sans);
       font-size: var(--type-body-size); line-height: var(--type-body-line); }
.primary { background: var(--color-accent); color: var(--color-on-accent); min-height: var(--size-primary);
           border-radius: var(--radius-pill); font-weight: var(--font-weight-bold); }
```

For production, self-host the font files (SIL OFL 1.1, keep `OFL.txt` next to them) instead of loading from Google.

Numbers: always `font-variant-numeric: tabular-nums lining-nums` for values that change or line up (glucose, doses, grams, times).

## Theme

- Light: white ground. Dark: true black (`#000`). An off-black alternative is documented in `docs/decisions.md` (D-04).
- The app follows the system setting by default. A user override sets `data-theme="light"` or `"dark"` on `<html>`.
- Never hard-code a colour. Every colour comes from a `--color-*` role.
