# Decisions

Numbered so other docs can point to them. Add new entries at the end.

## D-01 · Visual direction: Air with light list dividers

**Chosen:** B2, "pure-ish Air": B1 Air plus light 1 px dividers between rows of long lists (Historial, Ajustes). Everything else is B1. No cards, borders or shadows; space and headings group content; one large number leads each screen; interactive elements sit on a neutral fill; selection is a solid fill.
**Rejected:** A "Ledger" (hairline list everywhere, felt like a spreadsheet), C "Tonal" (closest to the old app, still too many containers), D "Paper" (outlined form look, too stiff).
**Variants kept for reference:** B1 (no dividers at all; lists were harder to scan), B3 (large text, the expected reflow), B4 (dim dark mode, see D-04).

## D-02 · Palette: Sumi neutrals + Sora accent

**Chosen:** hue-free ink neutrals (white / true black) with the logo's sky blue as the only brand colour. Sora 600 `#1E6CAF` in light, Sora 300 `#88BCF6` in dark with navy `#0B1E36` text on it. The first dark Sora (`#6EC1EA`) drifted to hue 231° and read as cyan; the owner preferred how Ai and Asagi keep one hue across modes, so Sora 300 now shares the light hue (249°).
**Rejected:** Ai (indigo), Asagi (blue-green), ink-only (no accent made the main action and selection too weak), and the old teal-tinted dark theme.
**Why:** the logo is blue; a neutral UI lets status colours (glucose, insulin) stay meaningful.

## D-03 · Typeface: Open Sans

**Chosen:** Open Sans (SIL OFL 1.1). Humanist, open shapes, very legible at small sizes, tabular figures, variable weight 300–800. Sits between the two earlier favourites: rounder and friendlier than Source Sans 3, plainer than Google Sans Flex.
**Runner-up:** Source Sans 3 (more compact; first choice before Open Sans).
**Considered:** Source Sans 3, Google Sans Flex, Inter, DM Sans, Noto Sans, Public Sans, Work Sans, Plus Jakarta Sans, Figtree, Nunito Sans, Hanken Grotesk, IBM Plex, BIZ UD Gothic, Atkinson Hyperlegible Next, and the native system font. All 12 Google Fonts candidates are OFL.
**Notes:** Inter and Geist were avoided because they are the default of so many products. Atkinson Hyperlegible Next is a good candidate for an optional "Texto legible" accessibility setting, not the default.
**Open question:** whether to use Open Sans on native iOS/Android or fall back to the system font there for full Dynamic Type behaviour. Either way, sizes must scale with the user's text-size setting.

## D-04 · Dark mode: true black (provisional)

**Chosen for now:** `#000000` background.
**Alternative:** B4 "dim": light `#FAFAF9`, dark `#131416`, fill `#1D1F22`, line `#26282B`, fg-muted `#9FA3A8`. Avoids OLED smearing when scrolling and is easier on some eyes. Owner to decide after living with both.

## D-05 · Glucose gauge instead of a plain ring

The old ring was a recognisable part of Tashi but did not encode anything readable. It stays, as an open 270° gauge: the arc shows the user's target range as a band and the reading as a dot, so a glance answers "am I in range, and how far off". The number in the centre and a state word with an icon carry the same information for anyone who cannot see the colours. An intermediate exploration dropped the ring for a bare 68 px number; the owner asked for the ring back.

## D-06 · Glucose state colours (proposal, needs owner sign-off)

| State | Colour role | Copy |
|---|---|---|
| In range | `glucose` (green) | "En rango" (only shown where helpful) |
| Above range | `warning` (amber) | "Por encima de tu rango" |
| Below range | `error` (red) | "Glucosa baja" |
| Urgent low | `error` + bold + icon | "Glucosa muy baja. Toma hidratos rápidos." |

Rule: red is never used for high glucose; a high reading is information, while a low is time-critical. Thresholds come from the user's settings (default 70–180 mg/dL / 3,9–10,0 mmol/L, the international time-in-range consensus).

## D-07 · Emoji replaced by line icons

Profile emoji (🤒, 🏃) rendered differently per platform and clashed with Air. Replaced with 18–20 px line icons (thermometer, runner), stroke 1.8 px, rounded caps.

## D-08 · Amber 500 darkened

`#C98A00` failed 3:1 on white (2.95). Now `#B07800` (3.80). Used for the luteal phase and the breakfast block.

## D-09 · Flat logo in Sora tones

**Chosen:** the logo is flat: each part is one Sora step, and the only shadow is the stem casting onto the bar. Light: bar navy 800 → 500, stem 600, drop 400, on a white tile. Dark: bar 300 → 500, stem 200, drop 400, on a Sora 950 tile. The extra steps (200, 400, 500, 700, 800) are primitives at hue 249° for the logo only, not UI roles. `logo/generate.py` reads them from `tokens.json`.
**Rejected:** the earlier glossy version with gradients, bevels and a translucent "liquid glass" stem. It fought Air's no-gradients, no-shadows rule and read as a different brand next to the flat UI.
**Open:** the exact tones are a first pass; iterate with the owner.

## D-10 · The logo goes without its tile unless a platform needs one

**Chosen:** the top bar, About and the browser favicon show the bare mark. The tile exists only for icons a platform crops or places on its own background: the home-screen and install icons (`apple-touch-icon`, the manifest icons). Elsewhere it only adds a box, which Air avoids.
**Rejected:** the 30 px app icon with `radius-phone-icon` from the first reference.

## D-11 · The nav bar has a top line

**Chosen:** a 1 px `line` border on top of the nav bar. With the same background on both and nothing between them, it was unclear where the bar started once rows scrolled under it. This is the one border Air allows outside long lists.
**Rejected:** a fade above the bar (softened the content but still gave no edge), a `fill` bar (a box around the nav), a translucent blurred bar (busy, and blur is costly on older phones).

## D-12 · Profile chips scroll sideways

**Chosen:** one horizontal row inside the content column, with fades at the column edges, as the app had before. Overrides the first rule ("wrap, never scroll"). Wrapped chips pushed the food input down and made the row's height change with the number of profiles.
**Rejected:** wrapping; a visible scrollbar.

## D-13 · Glucose entry is limited to what meters report

**Chosen:** typed readings must be 20–600 mg/dL (1,1–33,3 mmol/L), the range common meters and sensors report. Outside it the field shows "Revisa el valor. La glucemia debe estar entre 20 y 600 mg/dL." and Guardar stays disabled. The server enforces the same range.

## D-14 · Food grams are edited on the result, not by re-asking

**Chosen:** each recognised food's grams are an input on the result; changing them recalculates the dose on the device with the same ratio, profile and glucose reading the result was made with.
**Rejected:** editing the text and calculating again (slow, and the parser may recognise different foods the second time).

---

## Open work (in priority order)

1. **Glucose entry sheet.** Specified as component 20; a custom numeric keypad is still open.
2. **Profile picker and editor** (sheet from the ratio pill and from Ajustes).
3. **Entry detail and edit** (from Historial rows): delete with confirmation is in (component 12); the detail layout itself still needs a design pass.
4. **Cycle detail screen.**
5. **Empty, loading and error states** for every screen.
6. **Icon set.** Draw the full set at 20/24 px, stroke 1.8, as SVG in `icons/`.
7. **Native mapping.** iOS (SwiftUI) and Android (Compose) token exports if the app goes native; currently the app appears to be web/PWA.
8. **High-contrast theme** (increase-contrast setting): fg-muted → fg, line → stronger.
9. **Decide D-03 open question and D-04.**
