# Self-hosting

Tashi runs in its user's own accounts or on their own server. It ships as source only: no prebuilt image, no hosted instance, no deploy button. There are two ways to run it:

- **On Cloudflare**, entirely in a browser, with three free accounts: GitHub, Cloudflare and Anthropic. Cloudflare builds the person's own copy of the repository and runs it as a Worker with a D1 database.
- **On a server of your own** (a VPS, a NAS, a home server), as a Node program that keeps its data in a SQLite file.

Either way, everything about the instance itself is set in Tashi: the first account, the Anthropic key and the model. Cloudflare needs no variables or secrets, and the Node server takes three command-line options.

## Installing on Cloudflare

[INSTALL.md](../INSTALL.md) is the guide, written for someone who has never deployed anything. In short, and what happens underneath:

- The person forks the repository on GitHub, because Cloudflare's dashboard builds code only from a GitHub or GitLab repository they control.
- Workers Builds clones the fork, installs the dependencies and runs `wrangler deploy` from the root. `wrangler.jsonc` holds the build command (`pnpm build:cloudflare`: shared code, frontend, food catalog, static files), so no field needs filling in. Wrangler creates the D1 database on the first deploy because its binding has no id.
- The build makes a one-time setup token, bakes only its hash into the Worker and prints the setup link at the end of the build log ([authentication.md](authentication.md#setting-up-an-instance)).
- The Anthropic key and the model are set in Tashi's settings. Cloudflare needs no variables or secrets.
- On the first request, the Worker creates or migrates its tables in D1.
- Updating is **Sync fork** on GitHub; Cloudflare builds the new version.

Not settled yet, to check on the first real install:

- Keeping the data in the EU: whether creating a D1 database named `tashi` in the EU in the dashboard first (**Storage & Databases**, **D1**, **Create**, data location **European Union**) makes Wrangler use it instead of creating one, or what else does it without editing a file.
- That Workers Builds installs with pnpm from `packageManager`, which Node it uses, and that the build stays within the Free plan's build time.
- Whether the Worker name must match `wrangler.jsonc` (`tashi`) when someone names it differently.
- The CPU and query counts per request in the Worker's metrics.

## Running on your own server

Tashi needs Node 22 and pnpm, or Nix.

```sh
pnpm install
pnpm build
pnpm start --database /var/lib/tashi/tashi.sqlite
```

With Nix, `nix build` gives `result/bin/tashi`, which takes the same options. `tashi --help` lists them:

| Option        | Default | Meaning                                                                    |
| ------------- | ------- | -------------------------------------------------------------------------- |
| `--database`  |         | The SQLite file. Required; created on the first start and migrated on each. |
| `--port`      | 3000    | The port to listen on.                                                     |
| `--base-path` | none    | The path Tashi is served under behind a reverse proxy, such as `/tashi`.   |

- On its first start without an account, the server prints a setup link to its log. Behind a proxy, keep the part from `/setup` onwards and put it after your own address.
- The same build serves any base path: the server writes it into the page's `<base href>`, and the frontend resolves every URL against it.
- Back up the database with `sqlite3 tashi.sqlite ".backup copy.sqlite"`, which is safe while Tashi runs.
- bilbo runs Tashi this way, from this flake's package, as described in the [README](../README.md#deployment).

## How Tashi fits Cloudflare's free plan

Tashi is hosted on Cloudflare Workers with D1, and SQLite is its only database dialect, on Workers and on Node. Cloudflare needs no card, its free database does not pause or expire after inactivity and keeps 7 days of point-in-time recovery, a Worker has no cold start, and a D1 database created in the `eu` jurisdiction stores its data in the EU.

The Free plan's limits shape the design:

- D1 accepts 100,000 written rows a day, counting index writes. Past the limit the database rejects every query until 00:00 UTC, including the user's own logging. The food catalog (13,670 foods, about 6 nutrient rows each, plus servings, names and indexes) would not fit, so it is not in the database.
- A Worker gets 10 ms of CPU per request (waiting on D1 or Anthropic does not count) and a 3 MB compressed bundle.
- D1 has no interactive transactions, only an atomic `batch()` that cannot read halfway through.

The design:

- **The catalog is static files.** `pnpm build:catalog` turns `data/foods.db` into `search.json`, a stemmed word index with a short summary of each food (1.7 MB, 469 KB gzipped), and the full foods in shards of 16, stamped with the release. On Workers the index is bundled with the Worker and the shards are static assets; on Node both are read from disk. Search runs in memory, and a meal reads one shard per food it uses. The server reads the index with a hand-written check (9 to 32 ms, where zod took 62 to 242 ms) and refuses to start without a built catalog.
- **Meal items keep snapshots.** When a meal is logged, the server copies the values it doses with (name, nutrients, serving) from the deployed catalog into the meal item, with `source`, `external_id` and the release as a plain reference. `food_vocabulary` uses the same reference and falls back to search when a release drops the entry.
- **Writes go through a batch.** Repositories read first, then send all writes together (`WriteBatch`), as a D1 `batch()` on Workers or a transaction on Node. The batch accepts only inserts, updates and deletes, so a read inside one does not compile. With one person writing, read-then-batch is an acceptable race.
- **Statements stay small.** Tashi's own D1 dialect for Kysely (`data/d1`) and its write batch refuse a statement over 100 parameters, as D1 does, so local tests fail where Cloudflare would; inserts of many rows are split to fit. Instants are checked with `strftime`, since D1 refuses `GLOB` patterns over 50 characters.
- **Migrations run on start**: on the first request a Worker serves, and when the Node server starts.
- **Export and import** go through the API in small requests: "Download a copy" reads settings, history and remembered foods page by page into one JSON file (`tashi-diary`, version 1), and "Replace with a copy" sends it back 5 entries at a time, meals first. The file holds no key. If an import stops, loading the file again starts over.
- **Passwords use PBKDF2 through WebCrypto**, which is native code on Workers, at an iteration count that fits the CPU budget ([authentication.md](authentication.md#iterations)).

Testing:

- Unit tests use in-memory fakes.
- The repository and write batch contract suites run against SQLite files through `node:sqlite` and against Wrangler's local D1, the real D1 code backed by a local SQLite file. Neither needs credentials.
- The Playwright suite runs on `wrangler dev` with local D1 and a stand-in food parser (`packages/e2e/test-worker.ts`), and with `E2E_RUNTIME=node` on the Node server.
- A CPU budget test (`cpu-budget.test.ts`) drives the heaviest routes in process with cold caches and fails when the median goes over 5 ms, half the Workers limit. A meal of four foods runs the real parser, SDK and catalog against a scripted model. Medians on a laptop: meal 4.0 ms, timeline page 1.6 ms, settings 0.4 ms.
- Local runs do not enforce the CPU limit or the daily row quota; the Worker's metrics show those.

Open questions:

- D1 runs at most 50 queries per Worker invocation on the Free plan. Whether each statement of a `batch()` counts is not documented; import requests carry 5 entries until a deploy shows how much room there is.
- Whether CPU spent at Worker startup (parsing the search index) stays out of the first request's 10 ms, and whether fetches through the assets binding count toward the 50 subrequests of the Free plan.

## Not built yet

- **Data that belongs to people.** No table has an owner. The design is in [database-schema.md](database-schema.md#accounts-and-people-later): an **account** is a login, a **person** is the one whose data it is, and an **access** row says which account reaches which person and how. Settings, entries and vocabulary belong to a person, never to an account. Still open: what a caregiver sharing a person looks like in the interface.
- **More AI providers.** Connections are stored per kind ([database-schema.md](database-schema.md#ai-connections)); Anthropic is the only kind.
- **A Biome rule against type assertions.** `as` still appears where a schema or narrowing should do the work; a Biome plugin would make it an error, and the ones it finds would go.
