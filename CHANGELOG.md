# Changelog

What changes between versions of Tashi, for people who run their own copy. Each entry says what to do after updating, if anything.

## Unreleased

- While Tashi calculates, it shows each step as it happens, such as the food it is looking up, and a Cancel button. A proxy in front of Tashi has to pass streamed responses through without buffering them, or the steps arrive all at once at the end.
- A calculation that the model cannot finish no longer fails with "Something went wrong": the model gets more room for its answer and one more try, and when it still cannot finish, Tashi says so and lists the foods it had looked up. Tashi also says when Anthropic is busy, cannot be reached, or declines a request, and counts the cost of a failed calculation. Nothing to do after updating.
- Foods the catalog calls cooked, such as rice, pasta, oats, beans and vegetables, now use USDA's cooked entries, which fixes carbs that were counted from the raw or dry food. Nothing to do after updating: the catalog is rebuilt with the app.
- The catalog no longer has a cooking multiplier, which nothing used. Catalogs and saved meals that still carry it keep working.
- First version meant for installing from a fork: on Cloudflare from a browser ([INSTALL.md](INSTALL.md)), or on your own server with Node or Nix.
- Setting up: the first visit goes through a one-time link printed at the end of the build log (Cloudflare) or the server's log (Node), where you choose a name and a strong password.
- The Anthropic API key and the model are set in Tashi's settings and stored encrypted. Neither Cloudflare nor the server needs any variable or secret.
- Settings shows this month's calculations and their estimated cost, and Tashi says plainly when the Anthropic credit has run out.
- Tashi logs each API request, every unexpected error and sign-in outcomes as structured events, without names or diary data. On Cloudflare they appear under the Worker's **Observability** tab; a D1 query that does not answer within 10 s now fails its request instead of leaving it waiting.
- **Report a problem**, in Settings and on the sign-in screen, opens a GitHub issue filled in with what went wrong: the last 50 errors the server recorded (for an admin) and what failed in the browser, without meals, readings or names. The server keeps those errors in a new table, created when it starts.
- Your copy on GitHub can update itself every day. Turn it on once, as step 4 of [making your copy](INSTALL.md#1-make-your-copy-of-tashi-on-github) describes.
- When the server does not answer for 15 s, or a screen fails, Tashi says so and offers to report it, instead of staying on a blank screen.
- The Node server takes command-line options: `--database`, `--port` and `--base-path` (`tashi --help`).
- Tashi now says insulin units, in English and Spanish ("unidades"), where it used to say dose ("dosis"). The API's fields were renamed to match (`carb_units`, `total_units`, `correction_units` and `adjustment_units`). Nothing to do: your database is unchanged, and a diary file exported earlier still imports.
- The page that explains how the units are worked out moved from `/dose-explained` to `/units-explained`. The old address redirects, so bookmarks keep working. Nothing to do.
