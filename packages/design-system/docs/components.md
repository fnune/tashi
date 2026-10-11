# Components

Every component uses tokens from `tokens/tokens.css`. Names in `code` are CSS custom properties without the `--` prefix. The canonical rendering is variant **B2** (Air with light list dividers), Open Sans, Sora accent, in `reference/air-reference.html`.

Screen layout for all screens:

- Gutter `space-gutter` (20 px) left and right.
- 24 px between the top bar and the screen's first element; `space-section` (40 px) between sections within a screen. `space-stack` (16 px) between a section heading and its content.
- Top bar at the top, nav bar at the bottom, content scrolls between them.
- No cards, borders or shadows around sections. The dose card is the one exception (D-15).

---

## 1. Top bar

**Anatomy:** the logo mark without its tile (26 px; the tile is only for app icons, see D-10) + wordmark "Tashi" (`type-title` at 22 px, bold) on the left; the ratio pill on the right.

**Ratio pill:** shows the active meal ratio and the active profile.
- Content: profile icon (thermometer for Enfermedad, runner for Deporte, none for Normal) · meal name · base ratio in `fg-muted` · "→" · adjusted ratio in `accent-text`, bold. Example: `[icon] Cena 5,12 → 4,27 g/U`.
- With the Normal profile, show only `Cena 5,12 g/U` (no arrow).
- Style: `radius-pill`, 1 px `line` outline, height 40 px (hit area 44 px), `type-secondary`.
- Profile icon colour: `warning` for Enfermedad, `fg-muted` for Deporte.
- Tap: opens the profile picker sheet (not designed yet).
- Accessible name: "Ratio activo: Cena, 4,27 gramos por unidad, perfil Enfermedad".

## 2. Nav bar

Three items: **Calcular** (pin-plus icon), **Historial** (chart icon), **Ajustes** (sliders icon).
- Item: 24 px icon above `type-caption` label, min height `size-nav-item` (58 px), full third of the width.
- Inactive: `fg-muted`. Active: `accent-text` and bold label, no background pill (Air). Mark with `aria-current="page"`.
- A 1 px `line` border on top, so it is clear where content ends and the bar begins (D-11).

## 3. Section heading

`type-heading` (17 px bold), `fg`, sentence case. Not uppercase, no letter-spacing (that was the old style). Examples: "Perfiles de ratios", "¿Qué vas a comer?", "Voy a comer en", "Añadir", "Ayer", "Dosis".

## 4. Screen title

`type-title` (28 px bold). Used on Historial and Ajustes. Calcular has no title: the glucose reading leads.

## 5. Glucose gauge (Calcular)

The ring from the original app, redrawn so it encodes something: where the current reading sits relative to the user's target range.

- **Geometry:** 176 px square. A 270° arc open at the bottom (from 135° to 405°, clockwise), radius 68 in a 160 viewBox, stroke 10, round caps. Scale runs 40–400 mg/dL (2,2–22,2 mmol/L); values outside are clamped to the ends.
- **Track:** `fill`.
- **Target band:** the arc segment from the user's low to high threshold (default 70–180 mg/dL), `glucose` mixed 45 % into `fill`, butt caps. Threshold numbers sit just outside both ends of the band in 10 px `fg-muted`.
- **Reading dot:** 20 px circle on the arc at the reading's position, filled with the state colour, 4 px `bg` ring so it reads on top of the band.
- **Centre:** the number in `type-glucose` scaled to 48 px (bold, tabular), unit below in `type-caption` `fg-muted`, then the state in 13 px bold with a 14 px icon, in the state colour: ✓ "En rango" (`glucose`), ↑ "Alta" (`warning`), ↓ "Baja" (`error`). See D-06.
- **Edit button:** a 44 px `fill` pill with a 16 px pencil and the word "Editar", centred in the opening at the bottom of the arc so it reads as part of the gauge. Accessible name "Editar glucemia".
- **Centre size:** the number is 36 px and the unit and state 11 px, not the full `type-glucose`, so three digits, the unit and the state fit inside the arc with room around them. The block is centred on the circle's centre, not on the gauge's box. The reading's age ("hace 5 min") goes in the accessible name and the button's tooltip, not inside the arc.
- **No reading:** no dot, "Sin lectura" in the centre in `type-secondary` `fg-muted`, no state line, and the button reads "+ Añadir" with the name "Añadir glucemia".
- **Accessibility:** the gauge is one `role="img"` with a full sentence as its name: "Glucemia 142 miligramos por decilitro, en rango. Rango objetivo 70 a 180." The arc is never the only carrier of meaning; the centre text says the same in words.
- **Layout:** gauge on the left, stats stacked on the right. At large text sizes the gauge centres at 210 px and the stats move below it in three columns (B3).
- **Motion:** when a new reading arrives, the dot moves along the arc over `motion-base`. With reduced motion it jumps.

## 6. Stats

**Insulina activa**, **Objetivo**, **Corrección**, stacked beside the gauge.
- Each: value on top in `type-stat` (20 px bold, tabular), label below in `type-caption`, `fg-muted`. (In markup the label comes first, then the value: `<dt>` then `<dd>`, visually reversed with `flex-direction: column-reverse`.)
- 18 px gap. No dividers.
- Corrección with no reading: "—".
- Correction sign: "+1,0 U" or "−0,5 U". Use the true minus (U+2212).

## 7. Cycle summary

Optional, shown when cycle tracking is on.
- Header row: 12 px phase dot + "Día 16 de 28 · Fase lútea" in `type-body-strong` + chevron in `fg-muted`. The whole block is one button (opens cycle detail).
- Resistance curve above the bar: the typical insulin resistance over the cycle as a 20 px area chart, line in `insulin-basal` (1.5 px) over a 22 % fill of the same colour, spanning exactly the bar's width so the luteal rise sits over the luteal segment. Its legend sits on its own line under the phase labels: an 8 px `insulin-basal` dot and "Resistencia a la insulina" in `type-caption` `fg-muted`.
- Bar: 8 px high, four rounded segments sized by phase length (menstrual, follicular, ovulation, luteal), 3 px gaps, colours `cycle-*`. Today marker: 3 px wide `fg` line, 18 px tall, at the day's position, with a 2 px `bg` ring so it separates from the segment under it (like the gauge's reading dot).
- Legend below in `type-caption`, `fg-muted`, each label under its own segment: start-aligned to the segment, except Ovulación (centred on its short segment) and Lútea (end-aligned).
- The bar is decorative (`aria-hidden`); the header text carries the information.
- Phase colours are not medical status colours and must never be reused for glucose.

## 8. Profile chips

Single choice: **Normal**, **Deporte −20 %**, **Enfermedad +20 %**, and any user profiles.
- Chip: height 44 px, `radius-pill`, padding 0 14 px, `fill` background, no border. Label `type-body` 500 weight; percentage in `fg-muted`, tabular.
- Selected: `accent` background, `on-accent` text and icon. `aria-pressed="true"`, inside `role="group"` with a label. (A radiogroup is also fine.)
- Icons: 18 px line icons, no emoji.
- One row that scrolls sideways (D-12), clipped to the content column so it lines up with everything else. It snaps to chips; on a side with more chips, the last 24 px fade out, ending exactly at the column edge. No scrollbar. The active chip is scrolled into view.
- In Ajustes the chips gain a trailing edit button (pencil, 44 px hit area, separate accessible name "Editar perfil Deporte").

## 9. Food input

Free-text description of the meal.
- Label: section heading "¿Qué vas a comer?" as a real `<label>`.
- Field: `fill` background, no border, `radius-xl`, padding 14 × 16 px, `type-body-lg`, min height 108 px, grows with content (prefer auto-grow over a resize handle on mobile).
- Placeholder (empty): "Por ejemplo: 150 g de arroz, 120 g de pollo" in `fg-muted`.
- Focus: 3 px `accent` focus ring outside the field.

## 10. Timing segments

"Voy a comer en": **Ahora**, **10 min**, **20 min**, **30 min**.
- Four separate pills with 8 px gaps (Air), each `fill`, `radius-pill`, height 44 px, label `type-body`, `fg-muted`.
- Selected: `inverse-bg` with `inverse-fg`, bold. Deliberately not the accent, so the only accent on Calcular is the main action and the selected profile.
- At large text sizes, wrap to two columns.

## 11. Primary button

- Full width, height `size-primary` (60 px), `radius-pill`, `accent` background, `on-accent` label, `type-body-strong` at 17 px.
- One per screen. Label is a verb phrase that says exactly what happens: "Calcular dosis", "Registrar 5,5 U".
- Disabled (e.g. no food and no glucose): keep it visible, `fill` background, `fg-muted` label, and show why under it in `type-secondary` ("Escribe lo que vas a comer o añade tu glucemia"). Never hide the button.
- Loading: label changes to "Calculando…", button keeps its size, `aria-busy="true"`.

## 12. Secondary and text buttons

- Secondary: same size as primary, `fill` background, `fg` label. Use when two choices are equally valid (e.g. "Registrar" / "Ajustar").
- Text button: no background, `fg` bold label, 48 px min height. For low-emphasis alternatives.
- Destructive (delete entry): text button in `error`, always followed by a confirmation. Inside a sheet the confirmation replaces the sheet's content rather than stacking a second sheet: a sentence that says what will be lost ("¿Eliminar esta entrada? No se puede deshacer."), then two equal buttons side by side, "Cancelar" (secondary) and "Eliminar" (`fill` background, `error` label). It is a `role="alertdialog"` named by that sentence. Clearing the whole history uses a sheet of its own with the same layout.

## 13. Quick-add tiles (Historial)

**Insulina rápida**, **Insulina lenta**, **Glucemia**.
- Three equal columns, 8 px gap. Tile: `fill`, `radius-lg`, min height 72 px, padding 12 px, icon (20 px, category colour) above a `type-body-strong` label at 14 px. Content is top-aligned, so icons and first label lines line up across tiles even when one label wraps.
- Large text: stack into full-width rows with icon left (B3).

## 14. History entry

One row per event, grouped by day under a section heading ("Hoy", "Ayer", "Lunes 6 de octubre").
- Columns: time (`type-secondary`, `fg-muted`, tabular, 42 px) · icon (20 px, category colour, no tile in Air) · title over subtitle · value · chevron.
- Title `type-body-strong`. Subtitle `type-secondary`, `fg-muted`, one line with ellipsis.
- Value `type-body-strong`, tabular, right-aligned. Units: "168 mg/dL", "2,5 U", "9,2 g".
- Min height `size-entry` (60 px). 1 px `line` divider between entries; none after the last entry of a day.
- Categories: glucose (`glucose`, drop icon), rapid insulin (`insulin-rapid`, pen icon), basal insulin (`insulin-basal`, pen icon), meal (`meal`, fork-and-knife icon).
- Whole row is one button. Accessible name reads naturally: "18:41, Glucemia, 168 miligramos por decilitro, medida manual".

## 15. Settings row (Ajustes)

- Every row in a section has a subtitle, so titles line up from row to row. If a row has nothing useful to add, write a short explanation of the setting rather than leaving it out.
- Title (`type-body-strong`) with optional subtitle (`type-secondary`, `fg-muted`), value on the right in `accent-text` bold, chevron.
- Min height `size-row` (60–64 px). 1 px `line` divider between rows within a section; none after the last row.
- Rows that hold an inline control (e.g. "Incremento del bolígrafo" with **0,5 U** / **1 U**) are not buttons themselves; the control is a two-option segment: `fill` track, selected option `bg` with bold `fg`.

## 16. Ratio timeline (Ajustes)

- 10 px bar of rounded segments over 24 h, 3 px gaps, colours `day-*`. Hour ticks 00:00 · 06:00 · 12:00 · 18:00 · 24:00 below in `type-caption`, written as times so they read as hours.
- 12 px below it, one settings row per meal block, with no divider above the first: colour dot · "Desayuno" · "06:00–11:00" subtitle · value "6,0 → 5,0 g/U" (base → with active profile).
- The bar is decorative; the rows carry the information.

## 17. Glucose trend (reference only)

Shown in the Sumi explorations, not in the current app. If added: line in `accent`, 2.5 px; target range as a band of `glucose` at 18 % opacity; current point as a 10 px `accent` dot with a 3 px `bg` ring; axis labels in `type-caption`. Provide a text summary as the accessible name.

## 18. Notes and banners

Inline messages inside a screen (never modal unless an action is required).
- Layout: 20 px icon + text, padding 12 × 14 px, `radius-md`, background = status colour at 14 % over `bg`, text `fg`, icon in the status colour.
- Kinds: info (`accent`), success (`glucose`), warning (`warning`), error (`error`).
- Copy: what happened, what is safe, what happens next. See `docs/content.md`.

## 19. Dose result (Calcular)

Shown in place of the food form after "Calcular dosis". The foods come first, so the carbs are read before the dose they lead to.

- **Alimentos:** section heading, then one row per recognised food: name, GI badge and source; the grams as a small `fill` input followed by "g" and the carbs per 100 g; carbs on the right. Changing grams recalculates the dose immediately, with the same ratio, profile and glucose reading. "HC netos" total below.
- **Dose card:** the one card in the app (D-15): `fill` background, `radius-xl`, 20 px top and bottom, 16 px sides.
    - Top row: "Dosis sugerida · Comida" in `type-secondary` `fg-muted` on the left, a "¿Por qué?" link to the explanation on the right.
    - The dose, centred, in `type-dose` with "U" in `type-stat` `fg-muted`, between 56 px round − and + buttons on `bg`. They change the dose by the pen increment. Once it differs from the suggestion, a text button "Volver a 5,5 U" below it resets it.
    - A 12 px pill bar, one segment per part that adds units, sized by its share and 2 px apart. Units taken away (active insulin, a lower profile) are a striped overlay carved off the end, so the solid part is the dose.
    - Below the bar, one row of up to five terms, spread across the width: a 6 px dot in the part's colour and the signed value in `type-body-strong`, over a `type-caption` `fg-muted` label. A term that takes units away has a striped dot. In order, only when they apply:
        - HC (`meal`), unsigned.
        - Corrección (`glucose`), before active insulin.
        - Activa (`glucose`, striped), negative.
        - Grasa y proteína (`insulin-rapid`).
        - Perfil (`insulin-basal`), the units the profile adds or removes.
    - Labels may wrap at a space when the row is tight. Under 18 rem of card width the terms take two rows of three.
    - Pen rounding is not a term (D-16), so the terms can differ from the dose by up to half a pen step.
- **Action:** one full-width primary button, "Registrar 5,5 U". Its label always shows the units that will be logged.
- **Last:** the original text in `fg-muted` and a text button "Cambiar plato" that goes back to the form with the text kept.
- In Historial the same card is shown read-only, without − and +, the action or editable grams.

## 20. Number entry sheet (glucose)

- Sheet title says what is entered ("Glucemia actual"); the field's label is visually hidden because the title already names it.
- One large field (`fill`, `radius-xl`, 60 px high, the number centred in bold) with the unit inside it on the right.
- Out-of-range values (D-13) show the content-guide message under the field in `error`, outline the field in `error`, and keep "Guardar" disabled.

## Layout rules learned while building

- **Reserve space for conditional hints.** A hint that comes and goes (for example why a button is disabled) keeps its space and turns invisible, so nothing below it jumps.
- **Rows tint beyond their edges.** Full-width rows keep their text on the content edge; their hover and pressed tint is drawn 12 px wider on each side and rounded with `radius-md`, so the tint never touches the text.
- **Sheets in dark mode** get a 1 px `line` top edge; on true black the dimmed page and the sheet are otherwise the same colour.
- **Times are 24-hour everywhere,** including English, and hour ticks are written as times ("06:00").
- **Labels under a bar line up with their segment,** using the same day grid as the bar.
- **Range bands have round ends with a gap.** The gauge's target band has round caps, drawn short by the cap's radius so the round end lands on the threshold, and a 3 px `bg` ring that separates it from the track, like the reading dot's ring.

## 21. Theme setting (Ajustes → General)

- A three-option segment: "Sistema" (default), "Claro", "Oscuro". Subtitle "Solo aquí": it is stored on the device, not synced, since a phone and a laptop may want different themes.
- "Claro" and "Oscuro" set `data-theme` on `<html>`; "Sistema" removes it so `prefers-color-scheme` applies. The choice is applied before the first paint so there is no flash.
- Anything that switches by theme in markup (the logo, `theme-color`) must follow `data-theme`, not only the media query.

## States common to all interactive components

| State | Treatment |
|---|---|
| Focus (keyboard, switch access) | 3 px `accent` outline, 2 px offset |
| Hover (pointer devices) | Background darkens by mixing 6 % `fg` into it; icon-only buttons turn their icon from `fg-muted` to `fg`; full-width rows tint beyond their edges (see Layout rules) |
| Pressed | Background darkens by mixing 8 % `fg` into it; no scale animation |
| Disabled | `fill` background, `fg-muted` label, not focusable only if a reason is shown nearby |
| Selected | Solid fill: `accent` + `on-accent` (chips) or `inverse-bg` + `inverse-fg` (segments) |
