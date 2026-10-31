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

Tashi stores its data in SQLite through Node's built-in `node:sqlite`. `pnpm dev` keeps it in `dev.sqlite` at the root of the repository, and `pnpm dev` and `pnpm build` also build the food catalog from `data/foods.db` into `packages/backend/catalog`.

```sh
pnpm check && pnpm typecheck
pnpm test:unit   # runs the storage tests on temporary SQLite files and on Wrangler's local D1
pnpm test:e2e    # builds the Worker and runs the browser tests on wrangler dev with a local D1
E2E_RUNTIME=node pnpm --filter @tashi/e2e test   # the same browser tests on the Node server
```

## Deployment

Runs on bilbo as the `tashi` app (`nixos/tashi.nix` in fnune/bilbo), from this flake's default package. To ship, push to `main`, then in bilbo run `nix flake update tashi` and rebuild.

The server takes its settings as command-line options, listed by `tashi --help`: `--database` (the SQLite file, required; the schema is created and updated at startup), `--port` and `--base-path`. Everything else, the AI provider's key and model included, is set in Tashi's settings. On its first start without an account, the server prints a setup link to its log; open it to choose a name and password. Until then every address answers "not found".

## License

Tashi is licensed under the GNU Affero General Public License, version 3 only. See [LICENSE](LICENSE).
