# Accessibility

Target: **WCAG 2.2 AA** in both themes, plus the platform accessibility features listed below. Diabetes affects vision for many people (retinopathy), so legibility is not optional.

## Requirements

- **Contrast:** text 4.5:1, large text (24 px+, or 19 px+ bold) and non-text UI (icons, focus rings, chart lines, the gauge dot) 3:1. Checked by `scripts/check-contrast.mjs`.
- **Text size:** everything scales with the system text-size setting up to 200 %. No text in images. Layouts reflow (see B3 in the reference): the gauge centres, stats move below, quick-add tiles stack, segments wrap.
- **Touch targets:** at least 44 × 44 px; dose-changing actions 56–60 px high.
- **Colour is never alone:** glucose state has a word and an icon; history categories have an icon and a title; selected chips are a solid fill, not only a colour change.
- **Screen readers:** every control has a name in Spanish that reads naturally (see examples in `components.md`). The gauge, cycle bar and day timeline expose a sentence and hide their graphics. Numbers with units are read out in full ("2,5 unidades", "168 miligramos por decilitro") via accessible names where the abbreviation would be read badly.
- **Focus:** visible 3 px `accent` ring on every focusable element, never removed. Logical order: top bar, content top to bottom, nav.
- **Motion:** respect reduced-motion settings; no essential information in animation.
- **Language:** `lang="es"` on the app root.
- **Optional setting:** "Texto legible" swaps the face to Atkinson Hyperlegible Next (OFL) for low-vision users (see D-03).

## Contrast table

Generated with `node scripts/check-contrast.mjs --markdown`. Regenerate after any colour change.

| Pair | Use | Min | Light | Dark |
|---|---|---|---|---|
| `fg` on `bg` | Body text | 4.5 | 18.73 | 18.43 |
| `fg` on `fill` | Text on chips, segments, inputs | 4.5 | 16.73 | 16.17 |
| `fg-muted` on `bg` | Secondary text | 4.5 | 6.69 | 7.84 |
| `fg-muted` on `fill` | Unselected segment labels | 4.5 | 5.97 | 6.88 |
| `accent-text` on `bg` | Accent values, links | 4.5 | 5.50 | 10.57 |
| `accent-text` on `fill` | Accent text on fills | 4.5 | 4.91 | 9.27 |
| `on-accent` on `accent` | Primary button label, selected chip | 4.5 | 5.50 | 8.44 |
| `inverse-fg` on `inverse-bg` | Selected segment label | 4.5 | 18.73 | 18.43 |
| `accent` on `bg` | Focus ring, chart line, active nav | 3 | 5.50 | 10.57 |
| `glucose` on `bg` | Glucose icon and in-range text | 4.5 | 5.32 | 10.65 |
| `insulin-rapid` on `bg` | Rapid insulin icon and label | 4.5 | 4.91 | 10.18 |
| `insulin-basal` on `bg` | Basal insulin icon and label | 4.5 | 6.72 | 9.49 |
| `glucose` on `fill` | Glucose icon on quick-add tile | 3 | 4.75 | 9.34 |
| `insulin-rapid` on `fill` | Rapid icon on quick-add tile | 3 | 4.38 | 8.93 |
| `insulin-basal` on `fill` | Basal icon on quick-add tile | 3 | 6.00 | 8.32 |
| `warning` on `bg` | Warning text | 4.5 | 5.83 | 11.63 |
| `error` on `bg` | Error text | 4.5 | 6.54 | 9.52 |
| `cycle-luteal` on `bg` | Cycle phase dot and bar | 3 | 3.80 | 11.63 |
| `cycle-menstrual` on `bg` | Cycle phase bar | 3 | 5.11 | 8.65 |
| `cycle-follicular` on `bg` | Cycle phase bar | 3 | 4.04 | 10.65 |
| `cycle-ovulation` on `bg` | Cycle phase bar | 3 | 4.15 | 11.42 |
