# Changelog

What changes between versions of Tashi, for people who run their own copy. Each entry says what to do after updating, if anything.

## Unreleased

- First version meant for installing from a fork: on Cloudflare from a browser ([INSTALL.md](INSTALL.md)), or on your own server with Node or Nix.
- Setting up: the first visit goes through a one-time link printed at the end of the build log (Cloudflare) or the server's log (Node), where you choose a name and a strong password.
- The Anthropic API key and the model are set in Tashi's settings and stored encrypted. Neither Cloudflare nor the server needs any variable or secret.
- Settings shows this month's calculations and their estimated cost, and Tashi says plainly when the Anthropic credit has run out.
- The Node server takes command-line options: `--database`, `--port` and `--base-path` (`tashi --help`).
