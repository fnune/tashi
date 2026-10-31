# Tashi: T1D fast insulin dose calculator

## Problem

Calculating fast-acting insulin doses is something T1D people do multiple times a day. It requires:

1. Knowing your insulin-to-carb ratio (which varies by time of day)
2. Estimating the carbs in what you're about to eat
3. Doing mental math under time pressure (food is getting cold)

Step 2 is the hard part. People build intuition over years, but it's error-prone, especially with unfamiliar foods or mixed dishes. The goal is to make this fast, accurate, and effortless.

## Core flow

```
User sets up ratios once
        |
        v
User types what they're eating (in any supported language)
        |
        v
App resolves food items against its nutritional database
        |
        v
App shows breakdown table + recommended dose
```

## Setup (one-time)

Insulin-to-carb ratios, from the user's endocrinologist, per meal window:

| Meal window | Ratio |
|---|---|
| Morning (06:00-11:00) | X g per 1U |
| Lunch (11:00-16:00) | X g per 1U |
| Dinner (16:00-06:00) | X g per 1U |

Meal windows always tile the whole day, so a ratio applies at every hour. The settings UI enforces this by construction: moving a window's edge moves its neighbour's, adding a window splits the longest one, and removing one hands its hours to the previous window. Windows may run past midnight. Settings saved with a gap show a one-tap fix, and the API still answers `no_meal_window` for an uncovered time as a safety net.

Additional setup:
- Correction factor: 1U lowers glucose by X (mg/dL or mmol/L)
- Target glucose
- Pen increment: 0.5U or 1U (for rounding the final dose)
- Fat/protein extra, as a percentage of the meal dose
- Rapid insulin and its duration of action (drives insulin on board), basal insulin
- Glucose unit (mg/dL or mmol/L) and language
- Ratio format: grams of carbs per unit (g/U) or units per 10 g of carbs (U/ración in Spanish, as many Spanish endocrinologists prescribe). Ratios are always stored as g/U; the format only changes how they are shown and typed, and an untouched field keeps its exact stored value so switching formats never drifts.

Every change saves immediately.

### Profiles

A profile adapts doses to a situation (sport, sick day, a phase of the menstrual cycle). Exactly one is active, switched by hand from the chips on Calcular; profiles never expire or switch on their own.

- Percentage: multiplies the final total, after correction and fat/protein and before pen rounding. Ratios and the correction factor are untouched.
- By time of day: replaces the ratio of each window it sets; other windows keep theirs. Renaming a window carries its per-window ratios along.

Normal is built in and cannot be removed. Sport (-20 %), Sick day (+20 %) and Menstruation (+15 %) are seeded as editable examples, labelled as values to agree with the care team. Every result and logged meal records the profile it used.

### Menstrual cycle

Optional and informational: it never changes a dose. From the first day of the last period and the average cycle length (21-45 days) it works out the cycle day and phase, assuming a 5-day period and a 14-day luteal phase. Calcular shows the day and phase; on day 1 and on the first luteal day it suggests switching profile and opens a picker with the likely profile marked. The evidence for lower insulin sensitivity in the luteal phase is mixed (systematic review, 2023), which is why the decision stays with the user.

## Input

A single text field. Natural language, in Spanish or English.

The expectation is that the user weighs their food and provides a detailed description. The more specific the input, the more accurate the result. The app works with vague input too ("a plate of pasta") but will have to make more assumptions, and those assumptions will be visible in the output.

Good input:

```
150g arroz blanco cocido, 120g pechuga de pollo a la plancha, 80g ensalada mixta con 15ml aceite de oliva
```

Acceptable but less precise:

```
arroz con pollo y ensalada
```

The app handles both, but the first gives a reliable result while the second requires the LLM to guess portions. The UI should gently encourage specificity (e.g., placeholder text showing a well-described example) without being preachy about it.

The app detects the input language and responds in the same language.

## Food parsing: LLM + database lookup

The LLM is a parser, not a nutritional expert. It never estimates carbs. Its job:

1. Split the description into discrete food items
2. Normalize quantities ("a medium banana" -> ~120g, "two slices of bread" -> ~60g)
3. Identify cooked vs raw weight (default: cooked, since that's what people weigh on their plate)
4. Map each item to a database key
5. Flag anything ambiguous ("rice" -- white? brown?)

### Token-efficient processing

Passing the entire nutritional database in every LLM call is wasteful. Instead:

1. The app maintains a compact index: a flat list of all database keys with short aliases and categories (e.g., `rice_white_cooked: "white rice, cooked", "arroz blanco cocido" | grain`). This index is small enough to fit in a system prompt (~2-5k tokens for a few thousand items).
2. The LLM returns candidate database keys from this index.
3. The app looks up full nutritional data from the local database after the LLM call, not during it.
4. For common/recent queries, cache the LLM's parsed output so repeated meals skip the call entirely.

If the LLM can't find a match in the index, it returns a structured "unknown item" with its best guess at a description, and the app can either:
- Do a fuzzy search against the database
- Ask the user to clarify
- Fall back to the LLM estimating carbs as a last resort (clearly marked as "estimated, not from database")

### Cooked vs raw weight

This is one of the biggest sources of error. 100g of dry pasta is ~250g cooked.

- Default: assume cooked weight (that's what's on the plate)
- If the user says "75g dry rice" or "75g crudo", use raw weight and apply the cooking multiplier from the database
- The output always shows which interpretation was used

## Nutritional database

### Sources

Primary source, used for the bulk of the database:

- USDA FoodData Central, specifically the SR Legacy or Foundation Foods datasets. These are the gold standard: lab-analyzed values (not self-reported), publicly funded, well-structured, downloadable as structured data (CSV/JSON). Covers ~8,000+ whole foods and common preparations. This is what most serious nutrition apps (Cronometer, MyFitnessPal's verified entries) use as their backbone.

Supplementary, for foods with a Spanish/European focus:

- BEDCA (Base de Datos Espanola de Composicion de Alimentos), maintained by the Spanish Ministry of Science. Lab-analyzed, ~700 foods common in Spanish cuisine. Important for items where preparation style differs (e.g., "tortilla de patatas" is not a USDA concept). Published under open access.

For glycemic index:

- Sydney University Glycemic Index Research Service (SUGiRS) database. This is the canonical academic source for GI values, compiled from published peer-reviewed studies. All values are on the glucose reference scale (glucose = 100). Available at glycemicindex.com.

Not used:

- Open Food Facts: crowdsourced, so data quality varies. Useful for barcoded packaged foods but not reliable enough as a primary source for whole foods. Could be added later for barcode scanning.
- Nutritionix, FatSecret, etc.: commercial APIs with usage limits and unclear provenance. Avoid.

Every item in the app's output must cite which source its data comes from. The citation appears inline in the result (not buried in settings or footnotes).

### Carbs: fibre exclusion

Outside the US, "carbohydrates" on nutrition labels already excludes fibre. The app follows this convention: carbs displayed to the user never include fibre.

However, the database stores both values separately:

| Field | Example | Notes |
|---|---|---|
| `total_carbs_per_100g` | 28.7g | Includes fibre (as reported by USDA) |
| `fibre_per_100g` | 0.4g | |
| `net_carbs_per_100g` | 28.3g | `total_carbs - fibre`, used for all calculations |
| `carbs_include_fibre` | true | Flag indicating the source's convention |

This way, if we later ship in the US (where labels include fibre in carbs), the data is already there to switch conventions. But the current app always displays and calculates with net carbs.

### Other fields per item

| Field | Example |
|---|---|
| Name (en) | White rice, cooked |
| Name (es) | Arroz blanco, cocido |
| Sugars per 100g | 0.05g |
| Glycemic index (glucose scale) | 73 |
| GI source | Sydney University GI Database |
| Typical serving size | 150g |
| Cooking multiplier | 2.5x (dry to cooked weight) |
| Data source | USDA FoodData Central #169756 |

### Composite foods

For "sushi", "lasagna", "a burrito", two strategies:

1. Direct lookup for well-known composite foods (a slice of margherita pizza ~ 35g net carbs)
2. LLM decomposition for unknowns ("homemade lentil soup" -> lentils + carrots + onion + ...) with each component looked up individually

## Output

Calcular is built to glance, confirm and inject:

- A sensor card: the latest manual glucose reading from the last 30 minutes in a dial coloured by range (70-180 mg/dL, 3.9-10 mmol/L), insulin on board with its run-out time, the target, and a live correction preview. Tapping the dial logs a new reading.
- The meal description and pre-bolus time ("eating in" now, 10, 20 or 30 min).
- After calculating: one row per food with weight, carbs per 100 g, GI band and data source, items with 0 g included so nothing looks forgotten, then the net carb total.
- A dose card: the final dose, its parts (meal, correction, fat/protein), the meal window and profile used, and which fat/protein threshold applied. A "Why?" link opens an explainer of every step and its references.
- An "I'll inject" stepper in pen increments. Calculating is only a preview; logging records the meal and the units actually injected.

GI is informational only and never enters the dose math, since the standard of care is carb counting.

### Correction bolus

Correction = (glucose - target) / correction factor, using the recent manual reading if there is one. Insulin on board can cancel a correction for high glucose but never reduces the meal dose; below target the correction is negative and lowers the dose. The preview on the sensor card uses the same function as the calculation. Could eventually auto-fill from CGM APIs (Dexcom, Libre).

## History

History is a day-grouped timeline of meals, rapid and basal doses, and glucose readings:

- Each row shows time, type, a short description and the value
- Doses and readings open a sheet to change the amount or time, or delete them
- Meals open their full breakdown, can move in time, be deleted, or be reused as the starting point for a new calculation
- Quick-add buttons log rapid insulin, basal insulin or a glucose reading
- History lives on the user's own server and is never shared

## Localization

The app ships in English and Spanish. The LLM handles input in either language regardless of the UI language setting. Database items have names in both languages.

UI strings, error messages, food names in the output table, and source citations all follow the selected language.

## Safety

This app influences medical decisions:

- Show every item, every carb estimate, every assumption, every source
- Make it trivial to edit any value (tap a row to override)
- Always show which ratio and profile were used
- Never connect to pumps or auto-inject (recommendation only)

## Engineering requirements

### Stack

- TypeScript (strict mode) throughout, frontend and backend
- React + Vite for the frontend SPA
- Hono for the backend HTTP API (lightweight, typed)
- pnpm workspaces monorepo
- Biome for linting and formatting (single tool, fast)
- Vitest for testing

### Design system

All visual values (colour, type, spacing, radii, elevation, motion) live as custom properties in `packages/frontend/src/tokens.css`, with dark mode following the system. Stylelint rejects raw colours, lengths and font weights anywhere else, so restyling means editing tokens. Each component keeps its stylesheet next to it, built from shared primitives in `components/ui/` (sheet, list rows, fields, segmented control, option list, stepper, toggle, notice, button). Bottom sheets close by dragging down, tapping the handle or tapping the backdrop, and keep their scroll to themselves, since the UI is meant to ship inside an Android app.

### Development environment

A Nix flake provides all system dependencies (Node.js, pnpm). `nix develop` gets you a working environment with no other setup.

### Testing strategy

Integration tests over unit tests. The goal is bang-for-buck: test real request/response cycles, not internal implementation details.

The LLM call is behind a `FoodParser` interface. Tests use a deterministic fake implementation that returns the same structured output format without hitting any API. This lets us integration-test the full calculation pipeline (parsing output -> DB lookup -> carb math -> dose recommendation) without network calls or API costs.

### Code quality

- Strict TypeScript: `strict: true`, no `any`, no implicit returns
- Biome enforces consistent formatting and catches issues at the lint level
- No code comments that only explain the "what" -- code should be self-evident

## Tech considerations

### LLM call

- Structured JSON output, not free text
- System prompt includes the compact food index (not full nutritional data)
- Small/fast model for sub-2s latency
- Cache parsed results for repeated meals
- The LLM is a parser: language in, database keys out

### LLM provider abstraction

The LLM provider should be swappable. The app defines a simple interface: takes a system prompt + user message, returns structured JSON. Any provider that supports structured/JSON output works.

The app should ship with support for at least:
- Anthropic (Claude)
- OpenAI
- Google (Gemini)

Since the task is pure parsing (not creative or reasoning-heavy), most capable models will perform similarly -- the choice is mostly about cost, latency, and availability.

### Deployment

The app deploys as a NixOS service on Bilbo (https://github.com/fnune/bilbo), from the flake's `packages.default`, started with `--base-path` set to the subpath Bilbo serves it under. The same build serves any path: the server writes the path into the page's `<base href>`.

- The AI provider's key and model are set in Tashi's settings and stored encrypted with the instance's data key
- The backend never exposes the key to the frontend
- The frontend is a static SPA; all LLM calls go through the app's backend

This means the app is a single service with a small HTTP API: the frontend serves static files, and one endpoint handles the LLM-proxied food parsing.

### Offline support

The nutritional database is bundled with the app. Only the LLM call needs network. Cached parses for repeated meals reduce LLM calls over time.

## Scope

This is not a CGM app, meal planner, diet tracker, or insulin pump controller. It does one thing: describe food, see carbs, get a dose suggestion.

## Open questions

- Should the app learn from user corrections? (User always bumps "150g rice" to "200g" -> app adjusts portion intuition.) Privacy implications but useful.
- Photo input via LLM vision? Accuracy is improving. Could be a v2 feature.
- Barcode scanning for packaged foods via Open Food Facts?
- CGM integration (e.g. LibreView) to auto-fill glucose and add a glucose chart to History; needs its own plan.
- Voice input with speech to text, preferably the platform's own, so it costs nothing extra.
