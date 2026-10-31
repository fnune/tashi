# Self-hosting

Tashi runs in its user's own accounts or on their own server. It ships as source only: no prebuilt image, no hosted instance, no deploy button. There are two ways to run it:

- **On Cloudflare**, entirely in a browser, with three free accounts: GitHub, Cloudflare and Anthropic. Cloudflare builds the person's own copy of the repository and runs it as a Worker with a D1 database.
- **On a server of your own** (a VPS, a NAS, a home server), as a Node program that keeps its data in a SQLite file.

Either way, everything about the instance itself is set in Tashi: the first account, the Anthropic key and the model. Cloudflare needs no variables or secrets, and the Node server takes three command-line options.

## Installing on Cloudflare

The person installing has a GitHub account, a Cloudflare account and an Anthropic account, and does everything in a browser. Cloudflare's dashboard builds code only from a GitHub or GitLab repository the person controls, so they install from a fork.

This guide is checked by following it on a fresh Cloudflare account, with a screenshot for each step that shows a GitHub or Cloudflare screen.

1. Create a free GitHub account at github.com.
2. Open the Tashi repository on GitHub, press **Fork**, then **Create fork**. This makes your own copy, `your-name/tashi`.
3. Create a free Cloudflare account at dash.cloudflare.com (no card). When asked, choose a name for the free address; it becomes `tashi.that-name.workers.dev`.
4. In Cloudflare: **Workers & Pages**, **Create application**, **Connect GitHub**. GitHub asks which repositories Cloudflare may see: choose only `tashi`. Back in Cloudflare, pick it, keep the name `tashi`, leave every setting as it is, and press **Create and deploy**.
    - Workers Builds clones the fork, installs the dependencies and runs `wrangler deploy` from the root. `wrangler.jsonc` holds the build command (`pnpm build:cloudflare`: shared code, frontend, food catalog, static files), so no field needs filling in. Wrangler creates the D1 database on the first deploy because its binding has no id.
5. Wait for the build, about a minute. At the end of the build log, a framed block says **TASHI IS READY TO BE SET UP** with a link. Open it, choose a name and a strong password, and Tashi opens, signed in.
    - The build makes a one-time setup token and prints the link. Until someone uses it, the Tashi address answers "not found" to everything, so a stranger who finds it can do nothing. See [authentication.md](authentication.md).
6. Create an Anthropic account at console.anthropic.com, add a little prepaid credit (each calculation costs a fraction of a cent) and create an API key. In Tashi, open **Settings**, **AI food reading**, **Anthropic API key**, paste it and save. Tashi checks the key with Anthropic before keeping it, encrypted.
7. Add the address to the phone's home screen, and choose the insulin and ratios in **Settings**.
    - On the first visit Tashi creates its tables in the database; later versions apply their own migrations the same way.
8. Updates: on the fork's GitHub page, a notice says the branch is behind. Press **Sync fork**, then **Update branch**; Cloudflare builds and deploys the new version within minutes, and the data stays.
9. Backups: Tashi's **Settings**, **Your data**, **Download a copy**, from time to time. Cloudflare also keeps 7 days of point-in-time recovery of the database.

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
- **Repository tooling**, before the repository is published:
    - `renovate.json5`: weekly, a 7 day minimum release age, exact pins, no automatic merge, security updates without delay.
    - A pnpm catalog so shared dependency versions are pinned once, and exact versions in place of `^` ranges.
    - A Biome plugin that makes `as` type assertions an error, then removing the ones it finds.
    - `AGENTS.md` pointing to `docs/engineering.md` and listing the checks to run before calling work done.
    - `CHANGELOG.md` with an Unreleased section, because people updating a fork need to know what changed.
    - A pull request template with a test plan.
    - A CI workflow running `pnpm check`, `pnpm typecheck` and `pnpm test:unit`.
