# Self-hosting

Goal: someone non-technical forks the repo, connects a hosting platform that builds from it, adds a free database, sets one password, and pastes their Anthropic API key in the settings.
Tashi ships as source only: no prebuilt image, no hosted instance, no deploy button.
Non-goal for now: multiple users. One instance serves one person.

This tracks what stands between the repo and that setup.

## Done

- Server needs no `ANTHROPIC_API_KEY` at startup. The key is entered in settings, verified against Anthropic, encrypted at rest in `api-key.json` and never returned by any endpoint. The env var still works as a fallback.
- Saving a key in the UI requires `TASHI_PASSWORD` (or `TASHI_SECRET_KEY`) to be set, because the password is also the encryption passphrase. Changing it makes the saved key unreadable, so the user enters it again.
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
- [ ] 2. Fix what the assessment found, one commit each, listed at the end of that document.
- [ ] 3. Storage abstraction that survives a change of technology. The interface is declared by the domain, covers settings, timeline, vocabulary and the API key record, and exposes the operations the app needs, not generic CRUD. File storage implements it and runs a shared contract test suite. To discuss before building: one interface or one per concern, and whether it is async-only.
- [ ] 4. Pick the storage technology and implement it against the contract suite. Informed by the deployment targets, so it may wait on a first look at providers.
- [ ] 5. Write the bilbo migration script (backup with checksums, idempotent, counts per table, dry run), then cut over as described below.
- [ ] 6. Find providers.

### Migration of the bilbo data

The only existing instance is on bilbo (`nixos/tashi.nix` in fnune/bilbo).
It holds a real person's health data, so nothing happens before a verified backup.

1. Back up the data directory off bilbo and record checksums.
2. Write a one-off, idempotent script that reads the JSON files (including `api-key.json`) and inserts them into the database. It prints counts per table.
3. Run it against a throwaway database and compare counts and a sample of entries.
4. Cut over: stop the instance, take a final copy, run the script against the real database, point bilbo at it, check the timeline.
5. Keep the files and the backup for a while.

Open decision: bilbo moves to the database too (recommended, one code path) or keeps file storage alongside it.

### Export and import

Users of a free-tier database can lose their data (a paused project, a deleted account).
Needs a JSON export of settings, timeline and vocabulary, and an import that validates with the same schemas as the routes and asks for confirmation before overwriting.
Not needed for the bilbo move, which reads the raw files.

### Sign-in and user management basics

Basic auth with one shared password is the placeholder.

- Real sign-in page with email and password, a session cookie and logout.
- Password change and reset without losing the saved API key: give the encryption secret its own env var or generated secret instead of reusing the login password.
- Rate limiting or lockout on failed sign-ins.
- HTTPS-only cookies and a note on what platforms terminate TLS for the user.
- Decide whether the instance stays single-user. Multiple users and sharing with a caregiver are out of scope until then.

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

### Provider

Anthropic is the only provider and `LLM_MODEL` is env-only. Decide whether the model becomes a setting or other providers are supported.
