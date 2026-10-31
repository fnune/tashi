# Authentication

How people get into a Tashi instance: setting it up, signing in, keeping the Anthropic key safe, and, later, more accounts and a second factor.

## Goals

- Nothing to configure in a hosting dashboard. Someone who deploys Tashi to Cloudflare from a fork, leaving every setting as it is, sets it up in Tashi itself.
- An instance nobody has set up yet shows nothing: every address answers "not found", so a stranger cannot tell Tashi is there, let alone claim it.
- Accounts, so that two parents can share a child's diary.
- A leaked database reveals neither a usable session nor the Anthropic key.
- No email, SMS or any other message sent by Tashi.
- Established designs and the platform's own cryptography (WebCrypto), small enough to read in full and tested like the rest of the code.

## Not built yet

- More than one account: invitations, and people and access in the data. Designed below so they fit; built after sign-in works.
- A second factor: authenticator codes and passkeys. Designed below; built later.
- Signing in with Google, Apple or another provider.

## Setting up an instance

An instance with no account is unclaimed. It answers 404 with the same plain "not found" for every address, `/setup` included, unless the request carries the setup token.

- **On Cloudflare**, the build generates a random setup token (32 bytes), bakes only its SHA-256 hash into the Worker, and prints the setup link at the end of the build's own output, in a frame that is hard to miss. The build log is visible only to people in the Cloudflare account. Each build makes a new token; once an account exists, none of them works.
    - The link is complete when the build can find the account's `workers.dev` address through Cloudflare's API with the build's own credentials. When it cannot, the frame says to open the Tashi address shown further down and add `/setup?token=…`.
- **On Node** (a home server or a NAS), the server makes the token when it starts with no account and prints the link to its log once.
- **The setup page** asks for a name and a password and creates the first account, an admin, with a password sign-in method. It signs that account in straight away. The token is single-use in effect: after the first account exists, setup is closed.

Losing every way in has one last resort: whoever can run a new build (Cloudflare) or restart the server (Node) and read its log can reopen setup by removing the accounts. That is the same person who could delete the database, so it gives nobody new power.

## Accounts and sign-in methods

- An **account** is someone who signs in: an id, a name unique on the instance ("Fausto", "Ana") and a role, `admin` or `member`. No email address.
- An account has one or more **sign-in methods**, each a row of its own with a kind. The kind is `password`; authenticator codes and passkeys are further kinds, not columns on accounts.
- **Signing in**: the sign-in page asks for a name and a password. Names are typed, not listed, so the page does not reveal who uses the instance.

### Passwords

- At least 8 characters, no rules about composition, any length up to 256, as NIST SP 800-63B recommends.
- Hashed with **PBKDF2-SHA256 through WebCrypto**. It is native code on Workers and on Node, which makes it the slow hash that fits a free Worker's 10 ms of CPU per request; Argon2 and scrypt exist on Workers only as JavaScript or WebAssembly, several times slower for the same strength. Only signing in and setting a password pay for it, never an ordinary request.
- The iteration count is stored with each password, so it can be raised later and a password rehashed the next time its owner signs in. The count is as many iterations as fit in the CPU budget with room to spare (see Iterations).
- One PBKDF2 run gives 64 bytes, split by HKDF into a **verifier**, stored and compared in constant time, and a **key-encryption key**, never stored, which unlocks the account's copy of the data key (below).
- **Repeated failures** slow down: after 5 failed attempts for a name, each further attempt has to wait twice as long as the last, up to 15 minutes, recorded in the database. A failure for a name that does not exist costs the same time and gives the same answer.

## Sessions

The design described by the Lucia guide (lucia-auth.com) and the Copenhagen Book:

- A session token is 32 random bytes, sent in a cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path` set to the instance's base path.
- The database stores only the SHA-256 hash of the token, so a leaked database cannot be used to sign in.
- A session lasts 30 days from its last use, extended when it is past half its life, so a phone that opens Tashi daily stays signed in.
- A session has a **stage**: `signed_in`, or `second_factor` when a password is checked and a code is still due. Without a second factor, a session starts `signed_in`.
- Signing out deletes the session. Changing a password deletes every other session of that account.
- Requests that change anything must come from Tashi's own pages: Hono's `csrf` middleware checks the `Origin` header.
- Every API route needs a signed-in session except the sign-in, setup and health routes.

## The Anthropic key

The key is stored encrypted, and only a signed-in session can use it.

- The instance has one random **data key** (256 bits). The Anthropic key is encrypted with it (AES-256-GCM, `secret-box.ts`).
- Each sign-in method that can unlock the data key keeps its own copy, encrypted with that method's key-encryption key: envelope encryption, as password managers use to share a vault. A password method derives its key-encryption key from the password at sign-in.
- At sign-in, the data key is unlocked and encrypted again with a key derived from the session token (HKDF). The session row keeps that copy. A request carrying the cookie can unlock the data key; the database alone cannot, since it never holds the token.
- `ANTHROPIC_API_KEY` in the environment works as well and needs none of this.
- Without a data key in the session (a session started before the key was saved, say), saving the key creates the data key if none exists yet, wraps it for the account saving it, and puts it in the session.

## More accounts, later

- **People and access**: as `database-schema.md` describes, a person is whose diary it is, and access says which account reaches which person and how. Setup creates the first person along with the first account; every diary table gets a `person_id`.
- **Invitations**: an admin creates an invite in Tashi, a one-time link that expires after a few days, and sends it however they like. The link carries a random secret. The admin's session wraps the data key with a key derived from that secret; whoever opens the link chooses a name and a password, and their password method gets its own copy of the data key. Nothing is sent by Tashi and nobody shares a password.
- An admin can remove an account, reset another account's second factor and close open invites.

## A second factor, later

- **Authenticator codes** (TOTP, RFC 6238): a per-account secret shown once as a QR code, stored encrypted with the data key, checked with HMAC-SHA1 over the time step (WebCrypto, or `@oslojs/otp`). A session waits in `second_factor` until the code is right. A code cannot unlock the data key: six digits are too few to protect it.
- **Recovery codes**: ten single-use codes shown once when a second factor is added, stored hashed.
- **Passkeys** (WebAuthn, `@simplewebauthn/server`): as a second factor, or as a sign-in method on their own, since a passkey is already two factors. Checking a signature costs little CPU. Where the browser supports the WebAuthn PRF extension, a passkey can keep its own copy of the data key, so signing in with only a passkey still unlocks the Anthropic key.

## Iterations

PBKDF2-SHA256 through WebCrypto costs about 22 ms of CPU per 100,000 iterations in Node on a laptop; the figure for a deployed Worker is measured from its metrics. Tashi uses the count that keeps signing in under the Worker's CPU limit, and records it with each password.

## Data

New tables, in a migration of their own; the SQL goes into `database-schema.md` with the migration.

- `accounts`: id, name (unique, case-insensitive), role, created_at.
- `sign_in_methods`: id, account_id, kind (`password`), created_at, and the password's salt, iteration count, verifier and copy of the data key, required when the kind is `password`.
- `sessions`: token hash, account_id, stage, created_at, expires_at, and the copy of the data key for the session.
- `sign_in_failures`: the name tried, the number of failures and when the last one was.
- `anthropic_api_key`: the Anthropic key, encrypted with the data key.

## Order of work

- [ ] 1. An unclaimed instance answers 404 everywhere; the setup token from the build (Cloudflare) or the server's start (Node), and the framed link at the end of the build output.
- [ ] 2. Accounts, password sign-in methods and the setup page.
- [ ] 3. Sessions, the sign-in page, signing out, slowing repeated failures, the `csrf` check.
- [ ] 4. The data key and the Anthropic key saved in Settings.
- [ ] 5. The Cloudflare guide in `self-hosting.md` without any dashboard secrets.

Later: invitations, people and access, a second factor.
