# Instructions for agents working on the Tashi design system

You are continuing a design system that another session started. Read `README.md` first, then `docs/decisions.md`. Those two files explain what exists, why, and what is still open.

## Ground rules

- **Tokens are the single source of truth.** Change values only in `tokens/tokens.json`, then run `node scripts/build-css.mjs`. Never edit `tokens/tokens.css` by hand.
- **No raw colours in components.** Use `--color-*` roles. If a component needs a colour that has no role, add a role to both `theme.light` and `theme.dark` in `tokens.json`, add its pairs to `scripts/check-contrast.mjs`, and document it in `docs/components.md`.
- **Contrast must pass.** Run `node scripts/check-contrast.mjs` after any colour change. It must exit 0. Text needs 4.5:1; icons, focus rings, chart lines and large text need 3:1. Regenerate the table in `docs/accessibility.md` with `--markdown`.
- **Stay inside Air.** No cards, no section borders, no drop shadows, no gradients (the result card is the one exception, D-15). Grouping comes from space (`--space-section`, 40 px) and headings. If a screen feels like it needs boxes, add space or split the screen first. The only lines allowed are the light 1 px `line` dividers between rows of long lists (Historial entries, Ajustes rows), as in variant B2, and the nav bar's top line (D-11). No dividers between short groups, stats or chips.
- **One primary action per screen**, in `accent`. Alternatives are secondary (fill) or plain text buttons. Never a big "Accept" next to a tiny "Not now".
- **Touch targets ≥ 44 px.** Anything that changes the units: 56–60 px.
- **Text must scale.** Use rem (web) or Dynamic Type / sp (native). Test at 200 % text size. The B3 variant in the reference shows the expected reflow.
- **Copy is Spanish (es-ES)** and follows `docs/content.md`: decimal comma, space before units and %, true minus sign (−), 24-hour times. Calm, plain, never blaming.
- **Status colour never stands alone.** Pair it with an icon and/or words.
- **Medical safety:** never show more precision than the user's pen allows (0,5 or 1 U). Suggestions are suggestions: the user confirms every injection. Do not add auto-logging of insulin.

## How to extend

1. Check `docs/decisions.md` → *Open work* for the next item, or the task you were given.
2. Design it in `reference/air-reference.html` or a new reference file using only tokens.
3. Specify it in `docs/components.md` (anatomy, tokens, states, accessibility, copy).
4. If you made a choice someone might question, add a numbered entry to `docs/decisions.md` with the reason and the alternatives you rejected.
5. Run both scripts. Commit tokens, generated CSS and docs together.

## Commits

The owner is Fausto Núñez Alberro. Set him as the author. Do not add any AI attribution, co-author lines or "generated with" footers to commit messages.

## Do not

- Add Inter, Geist or another typeface without a decision entry. Open Sans was chosen over 13 alternatives (see D-03).
- Reintroduce the teal-tinted dark background of the old app; neutrals are deliberately hue-free.
- Use red for high glucose. Red (`error`) is for failures and for low glucose only (see D-06).
- Use emoji in the UI. Profile icons are line icons.
