# Tashi

Tashi is a calculator for people with type 1 diabetes. It counts the carbs in a meal you describe, then helps you calculate insulin units from your own ratios, correction factor and pen increment.

Describe what you're eating in plain words, in Spanish or English, and Tashi breaks it down into a table of foods, weights and net carbs, with the units of fast-acting insulin that your own ratios and correction factor work out to. An AI model reads the description; the carbs come from nutrition databases (USDA, BEDCA), and every value shows its source and can be edited. Tashi also keeps a diary of meals, insulin and glucose readings, and counts the insulin still active from earlier injections.

> [!CAUTION]
> A personal project, not a medical device. Tashi is not clinically validated and has no regulatory clearance. Its numbers come from the settings you enter, from nutrition databases and from an AI model's reading of your words, and any of them can be wrong. It does not replace your own judgement or your care team's advice: check every number before you act on it. The software comes without warranty of any kind (see [LICENSE](LICENSE)).

## Install your own

[INSTALL.md](INSTALL.md) sets up your own copy in a web browser. It needs GitHub, Cloudflare and Anthropic accounts; Anthropic charges a small amount per calculation. The copy runs in your Cloudflare account and the diary is stored there, and the author has no access to it.

To run it on a server of your own instead, see [Running on your own server](docs/self-hosting.md#running-on-your-own-server).

## How it works

1. Set up your insulin, your meal windows with their ratios, your correction factor and your pen increment, once.
2. Type what you're eating: `150 g arroz blanco cocido, 120 g pechuga de pollo a la plancha`.
3. Read the breakdown: net carbs per item, the total, and the insulin units rounded to your pen, adjusted for insulin still on board and, if you enter it, your current glucose.
4. Log it when you inject, so the diary and the insulin on board stay right.

## Documentation

- [Install Tashi](INSTALL.md): the step-by-step guide.
- [Changelog](CHANGELOG.md): what changes between versions, for people running their own copy.
- [Self-hosting](docs/self-hosting.md): Cloudflare and Node in detail, and how Tashi fits Cloudflare's free plan.
- [Authentication](docs/authentication.md): setup, accounts, passwords, sessions and how the Anthropic key is kept.
- [Database schema](docs/database-schema.md): every table, with the reasons.
- [Engineering](docs/engineering.md): the principles and conventions of this repository.
- [Design](design.md): the product: insulin units calculation, food parsing, the nutrition data.

## Development

Requires [Nix](https://nixos.org/download/), or Node 22 and pnpm:

```sh
nix develop
pnpm install
pnpm dev         # the app at http://localhost:5173, its data in dev.sqlite
```

`pnpm dev` and `pnpm build` also build the food catalog from `data/foods.db` into `packages/backend/catalog`.

```sh
pnpm check && pnpm typecheck
pnpm test:unit   # the storage tests run on temporary SQLite files and on Wrangler's local D1
pnpm test:e2e    # builds the Worker and runs the browser tests on wrangler dev with a local D1
E2E_RUNTIME=node pnpm --filter @tashi/e2e test   # the same browser tests on the Node server
E2E_WORKERS=2 pnpm test:e2e   # fewer parallel workers, each with its own servers (default 4)
pnpm nix:hash    # after changing dependencies: the new hash for nix/package.nix
```

CI runs the same checks, both browser test runs and the Nix build on every pull request. See [AGENTS.md](AGENTS.md) for the map of the repository and what to run before calling a change done.

Tashi also runs on a NixOS server from this flake's package, as the author's copy does: to update it, run `nix flake update tashi` in the server's configuration and deploy. See [self-hosting](docs/self-hosting.md).

## License

Tashi is licensed under the GNU Affero General Public License, version 3 only. See [LICENSE](LICENSE).
