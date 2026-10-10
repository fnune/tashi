# Content and formatting

The interface is in Spanish (es-ES). Write the way a calm, knowledgeable friend would talk: plain words, short sentences, "tú".

## Voice

- **Say what happens.** Buttons are verbs that describe the result: "Calcular dosis", "Registrar 5,5 U", "Guardar". Not "OK", "Continuar", "Aceptar".
- **Equal choices look equal.** When both options are fine, both buttons have the same size and weight: "Registrar" / "Ajustar". Never "Aceptar" / "Quizás más tarde".
- **No guilt, no pressure.** No streaks, no "¡No olvides…!", no exclamation marks in system copy.
- **Suggestions are suggestions.** "Dosis sugerida", never "Dosis recomendada" or "Debes ponerte". Under every suggestion: "Basado en tus ajustes. Tú decides la dosis."
- **Readings are information, not judgement.** "Por encima de tu rango", not "Glucosa mala" or "Cuidado".

## Errors

Pattern: **what happened** · **what is safe** · **what happens next / what you can do**. Never blame the user.

| Situation | Copy |
|---|---|
| Sync failed | **No se pudo sincronizar.** Tus registros están guardados en este teléfono y se sincronizarán cuando vuelvas a tener conexión. |
| Food not understood | **No hemos podido calcular los hidratos de "macarrones gratinados".** Añade los gramos o elige un alimento parecido. |
| Missing setting | **No tienes ratio para la merienda.** Se usa el de la comida (5,5 g/U). Puedes añadir uno en Ajustes. |
| Value out of range when typing | **Revisa el valor.** La glucemia debe estar entre 20 y 600 mg/dL. |
| Stale sensor data | **El dato del sensor tiene 25 min.** Mide antes de ponerte insulina o escribe un valor a mano. |

## Empty states

Say what will appear and how to add the first item. One action, no illustration needed.

- Historial: **Aquí verás tus comidas, dosis y glucemias.** Añade la primera con los botones de arriba.
- Calcular, no glucose: the readout shows "—" and the edit button reads "Añadir glucemia".

## Notifications

Only when they earn the interruption. Allowed by default: none. Opt-in examples: reminder to measure 2 h after a meal ("¿Quieres medir tu glucemia? Comiste hace 2 h."). Never marketing, never re-engagement.

## Numbers and units

| Rule | Example |
|---|---|
| Decimal comma | 4,27 g/U · 0,5 U · 36,6 g |
| Space between number and unit (use a no-break space U+00A0) | 150 g · 168 mg/dL · 2,5 U |
| Space before % (es-ES) | +20 % · −20 % |
| True minus sign U+2212, not a hyphen | −0,8 U · −20 % |
| Thousands: thin space or none for 4 digits | 2026 kJ · 12 400 pasos |
| 24-hour time | 08:35 · 18:41 |
| Ranges with an en dash, no spaces | 06:00–11:00 · 70–180 mg/dL |
| Ratios | g/U (grams of carbohydrate per unit). Show base → adjusted as "5,12 → 4,27 g/U" |

Use `Intl.NumberFormat('es-ES', …)` and `Intl.DateTimeFormat('es-ES', …)`. Note that es-ES omits the grouping separator for 4-digit numbers by default; that is fine.

**Glucose units:** a user setting. mg/dL shown as integers (168 mg/dL). mmol/L with one decimal (9,3 mmol/L). Convert with 18,016 mg/dL per mmol/L and round only for display. Default to mg/dL for es-ES.

**Insulin:** round suggestions to the pen increment set in Ajustes (0,5 U or 1 U). Never show more precision than the pen can deliver. Round down at the halfway point and say so in the breakdown ("redondeado a 0,5 U").

**Energy:** kJ first, kcal in brackets only if the user turns it on. Grams for all macros.

## Glossary

| Term in UI | Meaning |
|---|---|
| Glucemia | Blood glucose reading |
| Insulina rápida / lenta | Bolus / basal insulin |
| Insulina activa | Insulin on board |
| Ratio | Carbohydrate-to-insulin ratio, g/U |
| Factor de corrección | Glucose drop per unit of insulin (mg/dL per U) |
| Glucemia objetivo | Target glucose for corrections |
| Perfil | Ratio adjustment preset (Normal, Deporte, Enfermedad, custom) |
| Incremento del bolígrafo | Smallest step the pen can dose |
