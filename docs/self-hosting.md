# Self-hosting

Goal: someone non-technical forks the repo, connects a hosting platform that builds from it, adds a free database, sets one password, and pastes their Anthropic API key in the settings.
Tashi ships as source only: no prebuilt image, no hosted instance, no deploy button.
Non-goal for now: multiple users. One instance serves one person.

This tracks what stands between the repo and that setup.

## Done

- Server needs no `ANTHROPIC_API_KEY` at startup. The key is entered in settings, verified against Anthropic, encrypted at rest in `api-key.json` and never returned by any endpoint. The env var still works as a fallback.
- Saving a key in the UI requires `TASHI_SECRET_KEY`, a random string of at least 32 characters. The key is encrypted with AES-256-GCM under a key derived from it by HKDF, which costs microseconds where scrypt over the password cost tens of milliseconds. Changing the secret makes the saved key unreadable, so the user enters it again.
- Optional single-password gate (`TASHI_PASSWORD`, HTTP Basic auth, any username). Off when unset.
- Unrestricted CORS removed.
- `GET /api/health`, unauthenticated.
- Meal windows use the browser's time zone instead of the server's (`X-Timezone` header, falls back to server time).
- Root `pnpm build` and `pnpm start` produce a runnable app on plain Node 22 (Nix build unchanged). `engines` and `packageManager` are pinned.

## Open

### Database storage

State still lives in `settings.json`, `timeline.json`, `food-vocab.json` and `api-key.json` under `DATA_DIR`.
Free hosting tiers have ephemeral disks, so state needs a database.
`foods.db` stays bundled and read-only.
Provider hunting comes only after the steps below. Neon (Frankfurt) and Postgres were the working assumption, not a decision.

This is a cross-cutting change, so it follows [engineering.md](engineering.md). The one-off bilbo migration script is not part of the checked code: it lives outside the repo in the project context directory (`~/Documents/Context/tashi/`), runs over `ssh bilbo`, and takes the backup first.

Progress:

- [x] 1. Assess tests and dependency injection in the backend: [storage-assessment.md](storage-assessment.md).
- [x] 2. Fix what the assessment found, one commit each, listed at the end of that document.
- [x] 3. Storage abstraction that survives a change of technology: one repository interface per aggregate (settings, timeline, vocabulary, API key), declared by the domain, with a contract suite the file implementation passes. Details in [storage-assessment.md](storage-assessment.md).
- [x] 3b. Separate view, domain and data: `http/`, `domain/` and `data/` folders, `FoodLookup` declared by the domain, domain errors apart from HTTP mapping, `Doses` and `TimelineService` called by thin route handlers, and a test that enforces the import directions.
- [x] 4. Postgres through Kysely and `pg`, behind `DATABASE_URL`. The repositories in `data/postgres-repositories.ts` pass the same contract suite as the file ones. Without `DATABASE_URL` the server keeps using the files, so bilbo is unaffected until it is migrated. Details below.
- [x] 4b. Implement the schema in [database-schema.md](database-schema.md) (phase 1), and prove it end to end:
  - [x] Domain: a time zone on every entry, a required `total_dose` on meals, a source on vocabulary entries, cursor-paged timeline reads.
  - [x] Migration `0001` generated from the schema document (a test keeps them identical), Postgres repositories, in-memory fakes for unit tests, one contract suite run against both. File storage is removed.
  - [x] Server and API: `DATABASE_URL` required, cursor pagination, the zone taken from the browser.
  - [x] End-to-end tests with Playwright on Postgres, with a stand-in for the language model at the `FoodParser` seam: 21 new tests besides the 22 existing ones, on desktop and phone.
  - [x] The bilbo script re-run against the new schema: 384 entries, read back identical to the upgraded source, second run a no-op.
- [x] 5. Cut bilbo over. Done on 2026-10-27: see Cutover below.
- [x] 5b. Foods catalog in the database (phase 2 of the schema, migration `0002-catalog`):
  - [x] Entries, nutrients as rows, servings, release ranges and the curated foods layer; search by Postgres full text; `foods.db` imported at start by comparing it with the database.
  - [x] Missing nutrients are unknown, not 0: no carbohydrate means no offer, no fibre means net carbohydrate equals carbohydrate, and net carbohydrate is never below 0.
  - [x] Rehearsed against bilbo's backup: 528 meal items kept their entries, the timeline reads back identical, the import takes 1.8 s and 0.2 s when nothing changed.
  - [x] Deployed to bilbo on 2026-10-27: both migrations applied, the catalog imported on start, and the daily dumps run.
- [x] 6. Find providers: Cloudflare Workers and D1, which replaces Postgres. See below.

### Cloudflare Workers and D1

Decision: host on Cloudflare Workers with D1, and make SQLite the only database dialect. Plain Node installs (VPS, NAS, bilbo) use a SQLite file. Postgres goes away.

Why: one provider and one signup without a card; a free database that does not pause or expire after inactivity (no such rule found) and has 7 days of point-in-time recovery; no cold start; a D1 database created with jurisdiction `eu` stores its data in the EU; Cloudflare commits to a free D1 plan. Render needs a card and deletes its free database after 30 days, Supabase pauses after 7 days, Neon keeps 6 h of history and is a second provider.

Limits that shape the design (Free plan):

- D1 accepts 100,000 written rows a day, counting index writes and Wrangler imports. Past the limit the database rejects every query until 00:00 UTC, including the user's own logging. The catalog (13,670 foods, about 6 nutrient rows each, plus servings, names and indexes) does not fit, so it leaves the database.
- A Worker gets 10 ms of CPU per request (waiting on D1 or Anthropic does not count) and a 3 MB compressed bundle. scrypt and loading `foods.db` with sql.js at runtime do not fit.
- D1 has no interactive transactions, only an atomic `batch()` that cannot read halfway through.

Design:

- Catalog as static assets. The build turns `foods.db` into files stamped with the release hash, with a search index split by term so a query fetches only the files for its words. The server's `FoodCatalog` reads them through the assets binding on Workers and from disk on Node. Catalog updates ship with the build, and the startup sync goes away.
- Meal items keep snapshots. When a meal is logged, the server copies the values it doses with (name, nutrients, serving) from the deployed catalog into the meal item, with `source`, `external_id` and the release as a plain reference. `catalog_releases` stays in the database and keeps its foreign key; entries do not. `food_vocabulary` uses the same reference and falls back to search when a release drops the entry.
- Writes go through a batch: repositories read first, then send all writes together, as a D1 `batch()` or a transaction on `better-sqlite3`. With one user, read-then-batch is an acceptable race.
- The saved API key is encrypted with a key derived by HKDF from `TASHI_SECRET_KEY`, a long random string, instead of scrypt over the password. The secret becomes required to save a key in the UI.
- Migrations run at deploy on Workers (`wrangler d1 migrations apply --remote`) and at start on Node.

Testing:

- Unit tests use the in-memory fakes, as now.
- The repository contract suite runs against `better-sqlite3` in memory and against D1 through Wrangler's local runtime (`getPlatformProxy` or `@cloudflare/vitest-pool-workers`), which is the real D1 code backed by a local SQLite file. Neither needs a server or credentials.
- The Playwright suite runs against `wrangler dev` with local D1 and the stand-in `FoodParser`, wired by a test entry point as `packages/e2e/test-server.ts` does today.
- A CPU budget test (`cpu-budget.test.ts`) drives the heaviest routes in process with cold caches and fails when the median goes over 5 ms, half the Workers limit. A meal of four foods runs the real parser, SDK and catalog against a scripted model through an injected `fetch`. Medians on a laptop: meal 4.0 ms, timeline page 1.6 ms, settings 0.4 ms.
- Local runs do not enforce the CPU limit or the daily row quota. Check those on a preview deployment with the Workers metrics.

Progress:

- [x] 1. HKDF over `TASHI_SECRET_KEY` instead of scrypt, while bilbo has no stored key. The password no longer doubles as the secret.
- [x] 2. Write batches behind the repositories, checked by the contract suite on Postgres. `WriteBatch.write` takes only insert, update and delete queries, so a read inside a batch does not compile, and its own contract suite checks order, all-or-nothing and row counts. Settings no longer rely on deferred constraints: positions are shifted out of the way first.
- [x] 3. Catalog as static assets behind `FoodCatalog` and its contract suite. `pnpm build:catalog` (part of `pnpm build` and `pnpm dev`) writes `search.json`, a stemmed word index with a short summary of each food (1.7 MB, 469 KB gzipped), and the full foods in shards of 16. The server reads the index once at start, which takes 9 to 32 ms with a hand-written check where zod took 62 to 242 ms; on Workers it is bundled with the Worker and parsed at startup, outside the CPU of any request (to confirm in step 6). Search runs in memory; a meal then reads one shard per food it uses. `FoodCatalog.search` returns only the fields the parser sends to the model. The server refuses to start when the index's label differs from `foods.db`. Postgres still imports the catalog for the meal item foreign keys until step 4.
- [ ] 4. SQLite schema with snapshots on meal items, `better-sqlite3` repositories, unit tests on in-memory SQLite, e2e on SQLite. Remove `pg`, sql.js at runtime and the Postgres code. Update [database-schema.md](database-schema.md).
- [ ] 5. Move bilbo from Postgres to a SQLite file as a one-off on bilbo, rehearsed on a backup: the script writes the snapshots from the release ranges and lives in the project context directory, not in the repo. bilbo stays on Node until the Workers deploy is tested end to end.
- [ ] 6. Workers entry point, D1 dialect, `wrangler.jsonc`, migrations at deploy, CPU measured per route.
- [ ] 7. Export and import (below).
- [ ] 8. Rewrite this document for the new setup, with a short section for plain Node.

Open questions:

- Can a fork deploy from the Cloudflare dashboard without editing the D1 `database_id`, and does automatic provisioning set jurisdiction `eu`? If not, the user creates the database in the dashboard and pastes its ID as a build variable.
- Which D1 dialect: `kysely-d1` must be vetted against the dependency rules, and a small one written here may be simpler.
- Whether CPU spent at Worker startup (parsing the search index) stays out of the first request's 10 ms, and whether fetches through the assets binding count toward the 50 subrequests of the Free plan. Cloudflare's docs do not say.

The Postgres plan below is kept for its history until step 4 replaces it.

Storage design. The tables below are the first cut, which mirrors the JSON files. The schema to build instead, with its review, is in [database-schema.md](database-schema.md); it replaces this list and the current migration.

- Tables: `settings` and `api_key` hold one row each. `timeline_entries` has typed columns for the shared fields (id, type, time, units, insulin, glucose value and unit) and a `meal` jsonb column for the meal detail, with check constraints that tie the columns to the type. `food_vocabulary` is keyed by lower-cased description and food id.
- Migrations are TypeScript modules in `data/migrations/` holding plain SQL, applied by Kysely's migrator when the server starts, so a platform needs no extra step. They only go forward.
- The table types in `data/database.ts` are written by hand. Review nullable columns against the migration when changing either; `kysely-codegen` is the move if the schema grows.
- Rows read back go through the same zod schemas as the files and fail with a `StoredDataError` naming the table and entry.
- `pg` is pinned with Kysely; both were published more than seven days ago when added.

Running the Postgres tests: set `TASHI_TEST_DATABASE_URL` to an empty database you do not mind losing (the tests truncate its tables). Without it the suite is skipped.

Before deploying the Nix package to bilbo: `nix/package.nix` pins a hash of the pnpm dependencies (`pnpmDeps`), which changed with `kysely`, `pg` and `@types/pg`. Update it or the build fails.

### Migration of the bilbo data

The only existing instance is on bilbo (`nixos/tashi.nix` in fnune/bilbo).
It holds a real person's health data, so nothing happens before a verified backup.

1. Back up the data directory off bilbo and record checksums.
2. Write a one-off, idempotent script that reads the JSON files (including `api-key.json`) and inserts them into the database. It prints counts per table.
3. Run it against a throwaway database and compare counts and a sample of entries.
4. Cut over: stop the instance, take a final copy, run the script against the real database, point bilbo at it, check the timeline.
5. Keep the files and the backup for a while.

Open decision: bilbo moves to the database too (recommended, one code path) or keeps file storage alongside it.

Status of the plan above (the script and the backups live outside the repo, in `~/Documents/Context/tashi/`):

- Done: a backup of `/var/lib/tashi` was copied off bilbo and compared by checksum with the live files (`backups/20261027/`, read-only, plus a `.tar.gz` copy). Nothing on bilbo was changed beyond a copy in the home directory.
- Done: `bilbo-migration/migrate.mts` reads the legacy files, upgrades and validates them, writes through the real repositories, and reads the target back to compare it with the source. It is a dry run by default, refuses a target holding timeline entries the source lacks, and was run twice against a throwaway Postgres: 384 entries, identical read-back, the second run inserting nothing. The server then served the migrated data and the app showed it correctly.
- Done: the cutover (Cutover below).
- Done: database backups on bilbo. The service runs `pg_dump` into `/var/lib/tashi/backups` on every start and daily at 23:30, before the midnight borg run.
- bilbo has no `api-key.json`: it passes the key to the service as a credential, so the environment fallback keeps working after the move.

Old data does not fit the current schemas. 96 of the 146 meals (Apr 14 to Jun 11, 2026) were logged before later features and lack fields the strict schemas require. Reading those files with the new code would fail, so the script upgrades them once on the way in, and the code stays strict. The rules, with the number of times each applied to bilbo's data:

- `correction.iob` and `correction.iob_reduction` become 0 (92): insulin on board was not counted then.
- `fat_per_100g`, `protein_per_100g`, `fat_g` and `protein_g` of an item become 0 (101 each), and the same two per-100 g fields of its `food_item` (11): fat and protein were not recorded, and those meals were dosed without them.
- A `food_item` in the pre-USDA shape becomes `null` (37): the item keeps its description, weight and carbs.
- `weight_g: null` becomes 0 (3): the stored `net_carbs_g` was already 0.
- `correction: null` is removed (3).
- A meal with no `recommended_dose` (1, from the first days) gets the carbohydrate dose worked out from its carbs and ratio.
- An item labelled `BEDCA` becomes `curated` (1).
- A fast insulin entry of 0 U is dropped (1): a meal logged without insulin, which current logging records with no entry.
- Meals get `total_dose` (146), entries get the Europe/Berlin zone, 21 entries get a UUID derived from their old id, 2 dangling meal links are cleared, and the vocabulary entry gets its source.

The raw files stay in the backup. The legacy `history.json` is not migrated.

Backward compatibility is not a goal while there is one instance and one person's data to keep. That changes once other people deploy this: schema changes then need migrations that carry their data, and this one-off upgrade is the kind of work that has to become a normal migration.

Cutover, done on 2026-10-27:

1. Choose the database. The decision was a Postgres of its own for Tashi on bilbo, in the pattern of `nixos/sourceslist.nix`: Postgres 18, no TCP port (a Unix socket only), peer authentication so there is no password, a `tashi` role and database. The existing shared Postgres is Immich's and is version 14, which reaches end of life in November 2026.
2. In the bilbo repo, in a workspace of its own: add that unit to `nixos/tashi.nix`, set `DATABASE_URL` for the service, and replace the `tashi-backup` pre-start step with a `pg_dump` into `/var/lib/tashi/backups` (borg already covers that directory), on start and from a daily timer before the borg run.
3. The pnpm dependency hash in `nix/package.nix` is updated for `kysely`, `pg` and `@types/pg`, and the package was built and started from a clean copy against the migrated database. Bump the `tashi` flake input in bilbo once these commits are on `main`.
4. Stopped the service, took a final copy of `/var/lib/tashi` and compared checksums, ran the script as the `tashi` user against the new database (384 timeline entries, 1 vocabulary entry, 4 meal windows, 4 profiles), started the service on `DATABASE_URL` and checked the history in the browser. The old files and the backups stay on bilbo for a while.

### Export and import

Users of a free-tier database can lose their data (a paused project, a deleted account).
Needs a JSON export of settings, timeline and vocabulary, and an import that validates with the same schemas as the routes and asks for confirmation before overwriting.
Not needed for the bilbo move, which reads the raw files.

### Sign-in and user management basics

Basic auth with one shared password is the placeholder.

- Real sign-in page for an account with email and password, a session cookie and logout.
- Password change and reset without losing the saved API key: give the encryption secret its own env var or generated secret instead of reusing the login password.
- Rate limiting or lockout on failed sign-ins.
- HTTPS-only cookies and a note on what platforms terminate TLS for the user.
- Decide whether the instance stays single-account. More than one account and sharing a person with a caregiver are out of scope until then.

### Connecting data to users

No table has an owner today. The design, with the reasons for the names, is in [database-schema.md](database-schema.md#accounts-and-people-later): an **account** is a login, a **person** is the one whose data it is, and an **access** row says which account reaches which person and how (self, parent, partner, family, friend, caregiver, clinician; read, write, admin). Settings, entries and vocabulary belong to a person, never to an account. It lands as a later migration, with one account and one person created for bilbo's existing data.

Left open until then: whether the Anthropic key belongs to an account or to the instance, and what a caregiver sharing a person looks like in the interface.

### Platform setup and documentation

- Platform config for the recommended host (build command, start command, region, health check).
- `.env.example` listing every variable (`DATABASE_URL`, `TASHI_PASSWORD`, `TASHI_SECRET_KEY`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `PORT`, `DATA_DIR`, `BASE_PATH`, `FOODS_DB`). Not updated so far because the file was unreadable in the working session.
- A DIY README: fork, connect a platform, add a database, set the password, open the URL, paste the key.
- `BASE_PATH` is baked into the frontend at build time. Document that the platform root URL needs it empty.

### Verification

- Cold start time on a free tier: `foods.db` is about 3 MB and loaded with sql.js at startup.
- First request after the database scales to zero must not time out or show an error. Use a pooled connection string.
- The API key sheet and the "set it up" notice in the calculator have not been looked at in a browser.
- The e2e suite has not been run against these changes. `packages/e2e/test-server.ts` has its own `cors()` and builds its clock in the machine's time zone.

### Repository tooling

Not needed to self-host, but the repository should have it before it is published:

- A `LICENSE` file and `license` fields: done, AGPL-3.0-only.
- `renovate.json5`: weekly, a 7 day minimum release age, exact pins, no automatic merge, security updates without delay.
- A pnpm catalog so shared dependency versions are pinned once, and exact versions in place of `^` ranges.
- A Biome plugin that makes `as` type assertions an error, then remove the ones it finds.
- `AGENTS.md` pointing to `docs/engineering.md` and listing the checks to run before calling work done.
- `CHANGELOG.md` with an Unreleased section, because people updating a fork need to know what changed.
- A pull request template with a test plan.
- Report missing and invalid environment variables separately at startup.
- A CI workflow running `pnpm check`, `pnpm typecheck` and `pnpm test:unit` (and the Postgres tests against a service container).

### Provider

Anthropic is the only provider and `LLM_MODEL` is env-only. Decide whether the model becomes a setting or other providers are supported.
