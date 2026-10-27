# Engineering principles

Principles and conventions for this repo. Adapted from the openmusa engineering README to Tashi's stack.

## Principles

### Calm app

Tashi is built to feel calm: simple, clear, predictable, respectful of user agency. The people using it manage a chronic condition and are often tired or in a hurry. Engineers carry this through to the code, the copy, the defaults, and the failure paths.

- Simplicity is the default. A feature earns its place or it does not ship.
- Clarity over cleverness. Plain copy, ordinary words, predictable defaults.
- Every interaction is calm. No dark patterns. No shame buttons ("Accept" / "Maybe later"). No ads. No nagging.
- Respect user agency. The user is in control. We do not coerce, guilt, or hide options.
- Failures are shown calmly. Error messages are accurate, plain, and never blame the user.
- Notifications earn the interruption or they do not happen.

### Testability via dependency injection

Reference: [Mark Seemann](https://blog.ploeh.dk/), [_Dependency Injection Principles, Practices, and Patterns_](https://www.manning.com/books/dependency-injection-principles-practices-patterns).

- Constructor Injection is the default. Property Injection and Method Injection only when justified.
- Inject Volatile Dependencies: anything with side effects (IO, database, file system, network), nondeterministic behaviour (time, randomness), a runtime configuration requirement, or that does not exist yet.
- Do not inject Stable Dependencies: deterministic, side-effect-free types such as stdlib primitives, value objects, and pure functions (the dose math in `@tashi/shared` is one).
- The Composition Root is the single place where the object graph is composed: `packages/backend/src/server.ts`. Nothing else knows the concrete implementations of Volatile Dependencies.
- Prefer Pure DI (hand-wired at the Composition Root) over a container.
- Service Locator is an anti-pattern: receive dependencies as constructor parameters.
- Ambient Context (implicit access to time, randomness, configuration, the current user) is an anti-pattern: inject it. This includes `new Date()`, `Date.now()`, `crypto.randomUUID()` and `process.env` outside the Composition Root.
- Default arguments that construct a Volatile Dependency (`apiKeys = new ApiKeyStore(storage)`) hide wiring: pass it explicitly.
- A growing constructor argument list is a smell that the class has too many responsibilities.
- Tests follow the seams DI creates. Real implementations of Stable Dependencies. Hand-written in-memory fakes for Volatile ones. Integration tests hit real databases and services where reasonable; do not mock what you own.

### Layered architecture and abstraction ownership

- Split the backend into layers: HTTP (routes), domain (calculation, timeline rules, API key handling), data access (storage).
- Each layer declares the abstractions it consumes. The interface belongs to the consumer, not the implementer.
- The domain declares the storage interfaces it needs. Data access imports and implements them. The domain does not depend on data access.
- Reject naive layering, where each layer depends on the next one down. That is not Dependency Inversion.
- Business rules do not live in handlers or in storage code.

### Strict typing

- `strict: true` and the stricter flags in `tsconfig.base.json` stay on.
- Relaxing strictness is a smell and is fixed, not papered over: `as any`, `// @ts-ignore`, `// @ts-expect-error` without explanation, and casts that bypass narrowing.
- Schema-validate at every process boundary: HTTP requests, env vars, file and database reads, external APIs. Types are derived from the schema, never asserted into existence (`c.req.json<T>()` and `JSON.parse(...) as T` are assertions).
- Biome flags the common escape hatches. An escape hatch that makes it through review is a bug.

### Code comments

- Code is self-evident. Comments are a last resort.
- A comment is justified only by a non-obvious why: a hidden constraint, a subtle invariant, a workaround for a specific bug. Prefer a test named after the reason.
- Comments that restate what the code does are noise.

### Dependency hygiene

- Start with the platform: `fetch`, `crypto.randomUUID()`, `node:util.parseArgs`, `node --env-file`, `Intl`, native array methods.
- Vet every dependency: can the platform do it; size of the transitive tree; active maintenance.
- Prefer governance-neutral dependencies over OSS that exists to feed a vendor's hosted SaaS. Use such a dependency only when no neutral alternative exists, and document the choice in the PR.
- If it is under 50 lines, write it. Vendor utilities under 100 lines with attribution and the original license.
- Commit lockfiles. Treat `package.json` changes as code changes.
- Budget: the backend stays under 40 production dependencies, shared packages under 10. Exceeding needs written justification in the PR.
- Pin exactly: no `^` or `~` in `package.json`. Share versions across workspaces with [pnpm catalogs](https://pnpm.io/catalogs).

### Operational discipline

- Errors and failure modes: no silent catches. Errors carry context (what was attempted, with what inputs, what failed). Distinguish recoverable errors from programmer errors. Boundaries decide what to surface to the user; deeper layers throw.
- Observability: structured logs in production. If you cannot see it, you cannot fix it.
- Security: authentication on by default for a deployed instance. Secrets never in code or committed `.env` files. Least privilege on every credential.
- Health data is GDPR Article 9 special-category data. Encryption in transit and at rest where the platform allows it. Collect only what is used. State retention per data type. Define subject-access and erasure paths.

### Local checks before pushing

- Run the cheap checks locally: formatter, linter, type-check, and the tests that exercise the touched code.
- `pnpm check`, `pnpm typecheck`, `pnpm test:unit` cover the workspace. `pnpm --filter <name>` scopes to one package. `prek.toml` runs the first two on commit.

### Version control

- Prefer `jj`. One logical change per commit.
- Imperative mood, subject under 72 characters, no trailing period. The body explains why when the diff does not.
- No value-judgement words ("improve", "better", "cleaner", "robust") and no vague qualifiers ("various", "ensure", "make sure"). State the change in concrete terms.
- No AI attribution.

### Reproducible environments

- Same language, runtime and tool versions on every machine and in CI. `engines` and `packageManager` in `package.json` pin Node 22 and pnpm; the Nix flake provides the dev shell and the production build.
- One command to set up and one to run: `pnpm install`, `pnpm dev`.

### Toolchain

- TypeScript across the stack.
- Node 22 LTS, [pnpm](https://pnpm.io/) as the only package manager.
- [Biome](https://biomejs.dev/) for linting and formatting, stylelint for CSS.
- [Vitest](https://vitest.dev/) for unit tests, Playwright for end-to-end.
- Dependency updates by [Renovate](https://docs.renovatebot.com/): weekly batch, 7 day minimum release age, no auto-merge.

### Writing style

- Sentence case in headings.
- Bold sparingly.
- No em-dashes. Use a colon, comma, semicolon, period, or rephrase.
- No rhetorical triplets.
- One line per paragraph and per list item; never hard-wrap markdown.

## Use of AI and LLMs

LLMs may write code here. That code is held to the same standards as any other: tests at the unit, integration and end-to-end levels, strict typing with validated boundaries, dependency hygiene, and review of every change.
