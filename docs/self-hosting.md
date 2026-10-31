# Self-hosting

Goal: someone non-technical forks the repo, connects a hosting platform that builds from it, adds a free database, sets one password, and pastes their Anthropic API key in the settings.
Tashi ships as source only: no prebuilt image, no hosted instance, no deploy button.
Non-goal for now: multiple users. One instance serves one person.

This tracks what stands between the repo and that setup.

## Done

- Server needs no `ANTHROPIC_API_KEY` at startup. The key is entered in settings, verified against Anthropic, encrypted at rest in the database and never returned by any endpoint. The env var still works as a fallback.
- Saving a key in the UI requires `TASHI_SECRET_KEY`, a random string of at least 32 characters. The key is encrypted with AES-256-GCM under a key derived from it by HKDF, which costs microseconds where scrypt over the password cost tens of milliseconds. Changing the secret makes the saved key unreadable, so the user enters it again.
- Optional single-password gate (`TASHI_PASSWORD`, HTTP Basic auth, any username). Off when unset.
- Unrestricted CORS removed.
- `GET /api/health`, unauthenticated.
- Meal windows use the browser's time zone instead of the server's (`X-Timezone` header, falls back to server time).
- Root `pnpm build` and `pnpm start` produce a runnable app on plain Node 22 (Nix build unchanged). `engines` and `packageManager` are pinned.

## Open

### Cloudflare Workers and D1

Decision: host on Cloudflare Workers with D1, and make SQLite the only database dialect. Plain Node installs (VPS, NAS, bilbo) use a SQLite file.

Why: one provider and one signup without a card; a free database that does not pause or expire after inactivity (no such rule found) and has 7 days of point-in-time recovery; no cold start; a D1 database created with jurisdiction `eu` stores its data in the EU; Cloudflare commits to a free D1 plan. Render needs a card and deletes its free database after 30 days, and Supabase pauses after 7 days.

Limits that shape the design (Free plan):

- D1 accepts 100,000 written rows a day, counting index writes and Wrangler imports. Past the limit the database rejects every query until 00:00 UTC, including the user's own logging. The catalog (13,670 foods, about 6 nutrient rows each, plus servings, names and indexes) does not fit, so it leaves the database.
- A Worker gets 10 ms of CPU per request (waiting on D1 or Anthropic does not count) and a 3 MB compressed bundle. scrypt and loading `foods.db` with sql.js at runtime do not fit.
- D1 has no interactive transactions, only an atomic `batch()` that cannot read halfway through.

Design:

- Catalog as static assets. The build turns `foods.db` into files stamped with the release hash, with a search index split by term so a query fetches only the files for its words. The server's `FoodCatalog` reads them through the assets binding on Workers and from disk on Node. Catalog updates ship with the build, and the startup sync goes away.
- Meal items keep snapshots. When a meal is logged, the server copies the values it doses with (name, nutrients, serving) from the deployed catalog into the meal item, with `source`, `external_id` and the release as a plain reference. `catalog_releases` stays in the database and keeps its foreign key; entries do not. `food_vocabulary` uses the same reference and falls back to search when a release drops the entry.
- Writes go through a batch: repositories read first, then send all writes together, as a D1 `batch()` or a transaction on Node. With one user, read-then-batch is an acceptable race.
- The saved API key is encrypted with a key derived by HKDF from `TASHI_SECRET_KEY`, a long random string, instead of scrypt over the password. The secret becomes required to save a key in the UI.
- Migrations run at deploy on Workers (`wrangler d1 migrations apply --remote`) and at start on Node.

Testing:

- Unit tests use the in-memory fakes, as now.
- The repository contract suite runs against SQLite files through `node:sqlite` and, from step 6, against D1 through Wrangler's local runtime (`getPlatformProxy` or `@cloudflare/vitest-pool-workers`), which is the real D1 code backed by a local SQLite file. Neither needs a server or credentials.
- The Playwright suite runs against `wrangler dev` with local D1 and the stand-in `FoodParser`, wired by a test entry point as `packages/e2e/test-server.ts` does today.
- A CPU budget test (`cpu-budget.test.ts`) drives the heaviest routes in process with cold caches and fails when the median goes over 5 ms, half the Workers limit. A meal of four foods runs the real parser, SDK and catalog against a scripted model through an injected `fetch`. Medians on a laptop: meal 4.0 ms, timeline page 1.6 ms, settings 0.4 ms.
- Local runs do not enforce the CPU limit or the daily row quota. Check those on a preview deployment with the Workers metrics.

Progress:

- [x] 1. HKDF over `TASHI_SECRET_KEY` instead of scrypt, while bilbo has no stored key. The password no longer doubles as the secret.
- [x] 2. Write batches behind the repositories, checked by the contract suite. `WriteBatch.write` takes only insert, update and delete queries, so a read inside a batch does not compile, and its own contract suite checks order, all-or-nothing and row counts. Settings no longer rely on deferred constraints: positions are shifted out of the way first.
- [x] 3. Catalog as static assets behind `FoodCatalog` and its contract suite. `pnpm build:catalog` (part of `pnpm build` and `pnpm dev`) writes `search.json`, a stemmed word index with a short summary of each food (1.7 MB, 469 KB gzipped), and the full foods in shards of 16. The server reads the index once at start, which takes 9 to 32 ms with a hand-written check where zod took 62 to 242 ms; on Workers it is bundled with the Worker and parsed at startup, outside the CPU of any request (to confirm in step 6). Search runs in memory; a meal then reads one shard per food it uses. `FoodCatalog.search` returns only the fields the parser sends to the model. The server refuses to start without a built catalog.
- [x] 4. SQLite schema with snapshots on meal items, on Node through the built-in `node:sqlite` rather than `better-sqlite3`, which would be a native module to build in Nix; Kysely talks to it through a 30-line adapter. `DATABASE_PATH` replaces `DATABASE_URL`. The repository and write batch contract suites, the storage tests and the e2e suite run on temporary SQLite files. sql.js only builds the catalog. [database-schema.md](database-schema.md) is rewritten for SQLite, and its SQL is the migration. Until step 5, deploying this to bilbo would start an empty database, so bilbo stays on the release it runs.
- [x] 5. Move bilbo's data to a SQLite file. Done on 2026-10-31, after a rehearsal on a copy: a fresh dump restored into a throwaway Postgres, read with the Postgres code of the previous release, written through the SQLite repositories with each meal's release kept, and compared entry by entry. The cutover repeated that on a final dump taken with the service stopped. All 384 entries, the settings and the vocabulary read back identical from bilbo's running app; 528 meal items keep their food snapshot. bilbo backs up a `sqlite3 .backup` copy on every start and at 23:30, before the nightly borg run, and Tashi's Postgres is removed from its configuration. The scripts were one-offs and are not kept in the repository. bilbo stays on Node until the Workers deploy is tested end to end.
- [ ] 6. Workers entry point, D1 dialect, `wrangler.jsonc`, migrations at deploy, CPU measured per route.
- [x] 7. Export and import. Settings has a "Your data" section: "Download a copy" saves settings, history and remembered foods as one JSON file (`tashi-diary`, version 1), read page by page through the API; "Replace with a copy" shows what the file holds, asks before replacing, then sends it in requests of 25 entries, meals first, so each request stays small enough for Workers. The API key is not in the file. If an import stops, the file is unchanged and loading it again starts over. Tests cover the loops, a round trip through SQLite and both directions in the browser.
- [ ] 8. Rewrite this document for the new setup, with a short section for plain Node.

Open questions:

- Can a fork deploy from the Cloudflare dashboard without editing the D1 `database_id`, and does automatic provisioning set jurisdiction `eu`? If not, the user creates the database in the dashboard and pastes its ID as a build variable.
- Which D1 dialect: `kysely-d1` must be vetted against the dependency rules, and a small one written here may be simpler.
- D1 allows 100 bound parameters per query: timeline pages read entries with `IN` lists, so a page must stay under 100 entries (the app asks for 50), and import requests stay at 25 entries.
- Whether CPU spent at Worker startup (parsing the search index) stays out of the first request's 10 ms, and whether fetches through the assets binding count toward the 50 subrequests of the Free plan. Cloudflare's docs do not say.

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
- A CI workflow running `pnpm check`, `pnpm typecheck` and `pnpm test:unit`.

### Provider

Anthropic is the only provider and `LLM_MODEL` is env-only. Decide whether the model becomes a setting or other providers are supported.
