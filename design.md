# T1D fast insulin dose calculator

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

Insulin-to-carb ratios, from the user's endocrinologist:

| Meal window | Ratio |
|---|---|
| Morning (06:00-11:00) | 1U per X g |
| Lunch (11:00-16:00) | 1U per X g |
| Dinner (16:00-23:00) | 1U per X g |

Time windows are editable. Users can add extra windows (snack, night).

Additional setup:
- Correction factor: 1U drops blood sugar by X mmol/L
- Target blood sugar: assumed 6.0 mmol/L by default
- Pen increment: 0.5U or 1U (for rounding the recommended dose)

European units only (mmol/L, grams) to start.

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

A single compact table. Glance, confirm, inject.

```
Almuerzo | 1U : 10g | fuente: USDA, BEDCA

 Alimento                  | Cant. | HC netos
---------------------------|-------|----------
 Arroz blanco (cocido)     | 150g  |    42g
 Pechuga de pollo (plancha)| 170g  |     0g
 Ensalada mixta            |  80g  |     2g
 Aceite de oliva           |  15g  |     0g
---------------------------|-------|----------
 Total                     |       |    44g
 Dosis recomendada         |       |   4.5U
```

Design notes:
- Meal type and ratio shown once at the top
- Data sources cited at the top
- Items with 0g carbs still shown (nothing was forgotten)
- Dose rounded to the user's configured pen increment
- Ambiguous items marked: "Arroz blanco (cocido*)" with a footnote "*peso cocido asumido"
- Every number is tappable and editable
- GI column is optional (off by default, togglable in settings). When shown, it's informational only -- not used in dose math, since the standard of care is carb counting

### Correction bolus

If the user enters their current blood sugar, the output adds one line:

```
 Glucosa actual: 10.0 mmol/L | Objetivo: 6.0 | Factor: 1U / 2.2 mmol/L
 Correccion: 1.8U
 Total (comida + correccion): 6.5U
```

Optional per-calculation. Could eventually auto-fill from CGM APIs (Dexcom, Libre).

## Calculation history

The app keeps a history of all calculations, organized as a chat-like list:

- Each entry shows: timestamp, the food description as entered, the result table, and the recommended dose
- Users can tap any past entry to see the full breakdown
- Users can re-use a past entry as a template ("I'm eating this again")
- Users can delete individual entries or clear all history
- History is local-only, never sent to any server

This doubles as a testing/exploration tool: try different food descriptions and compare results without any commitment.

## Localization

The app ships in English and Spanish. The LLM handles input in either language regardless of the UI language setting. Database items have names in both languages.

UI strings, error messages, food names in the output table, and source citations all follow the selected language.

## Safety

This app influences medical decisions:

- Show every item, every carb estimate, every assumption, every source
- Make it trivial to edit any value (tap a row to override)
- Always show which ratio was used and allow override
- Include a clear disclaimer: this is a tool, not medical advice
- Never connect to pumps or auto-inject (recommendation only)

## Engineering requirements

### Stack

- TypeScript (strict mode) throughout, frontend and backend
- React + Vite for the frontend SPA
- Hono for the backend HTTP API (lightweight, typed)
- pnpm workspaces monorepo
- Biome for linting and formatting (single tool, fast)
- Vitest for testing

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

The app deploys as a NixOS service on Bilbo (https://github.com/fnune/bilbo). Each deployment is pre-configured with LLM credentials -- there is no user-facing API key management.

- LLM API key stored in `/etc/nixos/secrets/t1d-aid-llm-key` (same pattern as other Bilbo secrets)
- LLM provider and model configured via the NixOS service definition or an environment file
- The app reads credentials at startup from the filesystem, never exposes them to the frontend
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
- CGM integration (Dexcom/Libre APIs) to auto-fill blood sugar for correction bolus?
