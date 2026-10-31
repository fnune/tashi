# Working on Tashi

Read [docs/engineering.md](docs/engineering.md) first: it sets the principles, the architecture, the writing style and the version control conventions this repository follows.

## Map

- `packages/shared`: types and the dose math, pure functions shared by the server and the app.
- `packages/backend`: the server. `src/http` (routes), `src/domain` (rules and the interfaces they need), `src/data` (SQLite, D1, the food catalog, Anthropic). `src/app.ts` builds the app; `src/server.ts` (Node) and `src/worker.ts` (Cloudflare) are the two entry points.
- `packages/frontend`: the React app.
- `packages/e2e`: Playwright tests, run on `wrangler dev` and on the Node server.
- `docs/`: [self-hosting](docs/self-hosting.md), [authentication](docs/authentication.md), [database schema](docs/database-schema.md), [paged lists](docs/paged-lists.md). Docs describe the code as it is today, never its history.
- `nix/package.nix` and `flake.nix`: the Nix package and the development shell.

## Before calling work done

```sh
pnpm check          # Biome and stylelint
pnpm typecheck
pnpm test:unit
pnpm test:e2e       # when the change touches what a browser sees or the server's routes
```

- A change to `database-schema.md` SQL must match the migrations: a unit test compares them.
- A change to dependencies changes the hash in `nix/package.nix`: run `pnpm nix:hash`.
- Add a line to `CHANGELOG.md` under Unreleased when people running their own copy will notice the change or have to do something after updating.
