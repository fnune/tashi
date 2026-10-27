# Tashi

Tashi is a fast-acting insulin dose calculator for people with Type 1 Diabetes.

Describe what you're eating in plain language, and Tashi breaks it down into a carb-by-carb table with a recommended insulin dose. It uses an LLM to parse your input and a local nutritional database (USDA, BEDCA) to look up accurate values, so you're never relying on guesswork.

## How it works

1. Set up your insulin-to-carb ratios, correction factor, and pen increment once
2. Type what you're eating: `150g arroz blanco cocido, 120g pechuga de pollo a la plancha`
3. Get a breakdown table with net carbs per item, total carbs, and a dose recommendation

Works in Spanish and English. Every value is editable, every source is cited inline.

## Future ideas

- Voice/mic input with speech-to-text (preferably using the platform-native API to avoid extra costs)

## Development

Requires [Nix](https://nixos.org/download/):

```sh
nix develop
pnpm install
```

Tashi stores its data in Postgres, so a running server needs `DATABASE_URL`. The shell has Postgres 18 for the tests:

```sh
pnpm check && pnpm typecheck
TASHI_TEST_DATABASE_URL=postgres://user@localhost/scratch pnpm test:unit   # truncates that database's tables
pnpm test:e2e                                                              # starts its own temporary Postgres
```

Without `TASHI_TEST_DATABASE_URL` the Postgres tests are skipped. The end-to-end tests need `initdb` and `pg_ctl` on `PATH` (or `PG_BIN` pointing at their directory) unless `TASHI_TEST_DATABASE_URL` is set.

## Deployment

Runs on bilbo as the `tashi` app (`nixos/tashi.nix` in fnune/bilbo), from this flake's default package. To ship, push to `main`, then in bilbo run `nix flake update tashi` and rebuild.

`DATABASE_URL` (a `postgres://` URL) is required; the schema is created and updated at startup. Set `TASHI_PASSWORD` to require HTTP Basic auth (any username, that password) on everything except `GET /api/health`. Leave it unset for no gate.

## License

Tashi is licensed under the GNU Affero General Public License, version 3 only. See [LICENSE](LICENSE).
