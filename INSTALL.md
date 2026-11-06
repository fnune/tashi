# Install Tashi

This page puts your own Tashi on the internet, at an address only you know, in about 20 minutes. You do everything in a web browser; nothing gets installed on your computer.

Your Tashi runs in your own accounts, and your diary stays in them. Nobody else, including the people who make Tashi, can see it.

## What you need

- **An email address** for three free accounts: GitHub (keeps your copy of Tashi), Cloudflare (runs it) and Anthropic (reads your meal descriptions).
- **A payment card for Anthropic only.** Anthropic charges for reading meals: a calculation costs a fraction of a cent, so $5 of credit lasts months. GitHub and Cloudflare are free and ask for no card.
- **A password manager, or somewhere safe to write a password.** Tashi has no "forgot my password" yet.

## 1. Make your copy of Tashi on GitHub

1. Go to [github.com/signup](https://github.com/signup) and create a free account. Confirm your email when GitHub asks.
2. Open [github.com/fnune/tashi](https://github.com/fnune/tashi).
3. Press **Fork** near the top right, then **Create fork**.

You now have your own copy at `github.com/your-name/tashi`. Leave that tab open.

## 2. Create your Cloudflare account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and create a free account. Confirm your email.
2. If Cloudflare asks you to choose a subdomain for Workers, pick a name you like. Your Tashi's address will be `tashi.that-name.workers.dev`.

## 3. Let Cloudflare build your Tashi

1. In Cloudflare, open **Workers & Pages** in the menu on the left, then press **Create application**.
2. Choose **Import a repository** (or **Connect GitHub**). A GitHub window opens asking what Cloudflare may see: choose **Only select repositories**, pick **tashi**, and press **Install & Authorize**.
3. Back in Cloudflare, pick your `tashi` repository. Keep the project name `tashi` and **leave every other setting as it is.**
4. Press **Create and deploy** (or **Deploy**).

Cloudflare now builds Tashi, which takes about a minute. It also creates Tashi's database by itself; you don't need to make one.

## 4. Set up Tashi with the link from the build

When the build finishes, its log ends with a large frame:

```
██████████████████████████████████████████████████████
█ TASHI IS READY TO BE SET UP                        █
█                                                    █
█ Open this link to choose your name and password:   █
█                                                    █
█ https://tashi.your-name.workers.dev/setup?token=…  █
██████████████████████████████████████████████████████
```

1. If the log is not on screen, open your `tashi` Worker in Cloudflare, then **Deployments**, then the latest build, and scroll to the end of its log.
2. Open the link in that frame. If the frame instead asks you to add `/setup?token=…` to your Tashi's address, open your `tashi` Worker in Cloudflare, copy the address it shows under **Domains & Routes** (ending in `workers.dev`), and add that part to the end.
3. Choose your name and a password. The bar under the password shows how strong it is; four or more random words make a strong password that is easy to type. Press **Set up Tashi**.

Tashi opens, signed in. Keep the password in your password manager.

Until someone uses that link, your Tashi's address shows only "Not found", so nobody who stumbles on it can do anything. Once your account exists, the link stops working.

## 5. Give Tashi your Anthropic key

1. Go to [console.anthropic.com](https://console.anthropic.com) and create an account.
2. Open **Billing** and add some credit, for example $5.
3. Open **API keys**, press **Create key**, name it "Tashi", and copy it. It starts with `sk-ant-`.
4. In Tashi, open **Settings**, then **AI food reading**, then **Anthropic API key**. Paste the key and press **Save**.

Tashi checks the key with Anthropic before keeping it, and stores it encrypted. Below it, Settings shows how many calculations you have made this month and roughly what they cost.

## 6. Put Tashi on your phone

1. Open your Tashi's address on your phone and sign in.
2. Add it to the home screen. On iPhone: the share button, then **Add to Home Screen**. On Android: the menu (three dots), then **Add to Home screen** or **Install app**.
3. In **Settings**, choose your insulin, your meal windows and your ratios.

That's it. Tashi is ready to use.

## Keeping Tashi up to date

When there is a new version of Tashi, your copy on GitHub shows a notice that your branch is behind.

1. Open your copy on GitHub (`github.com/your-name/tashi`).
2. Press **Sync fork**, then **Update branch**.

Cloudflare builds the new version within a few minutes. Your diary and your settings stay. The [changelog](CHANGELOG.md) says what changed and whether you need to do anything.

## Keeping a copy of your diary

In Tashi, open **Settings**, then **Your data**, then **Download a copy**, from time to time, and keep the file somewhere safe. **Replace with a copy** loads such a file back. Cloudflare also keeps the last 7 days of your database.

## If something goes wrong

- **The build failed.** Open the build log and look at the last lines. Pressing **Retry build** in Cloudflare often fixes a hiccup. If it fails again, [open an issue](https://github.com/fnune/tashi/issues) with the end of the log.
- **The setup link shows "Not found".** Each build makes a new link and only the newest works. Open the log of the latest build and use the link there. If you already set Tashi up, the link is closed: open your Tashi's address and sign in instead.
- **I lost the setup link.** In Cloudflare, open your `tashi` Worker, then **Deployments**, and press **Retry build** on the latest one. The new build prints a new link.
- **Calculating says the Anthropic key is missing or rejected.** Open **Settings**, **AI food reading**, and save a key again. Check that you copied all of it.
- **Calculating says the Anthropic credit has run out.** Add credit at [console.anthropic.com](https://console.anthropic.com) under **Billing**, then calculate again.
- **Tashi says it is not answering, or something else fails.** Press **Report a problem** (in **Settings**, on the sign-in screen, or on the screen that says what went wrong). It opens a GitHub issue with what Tashi recorded; read it, add what you were doing, and submit it. For more detail, open your `tashi` Worker in Cloudflare, then **Observability**, and look for events marked as errors around that time.
- **I forgot my password.** There is no reset yet, which is why a password manager and a copy of your diary matter. [Open an issue](https://github.com/fnune/tashi/issues) and we'll help you start over without losing the diary.

## Running Tashi on your own server instead

Tashi also runs as a Node program on a server, a NAS or a home computer, keeping its data in a single file. See [Running on your own server](docs/self-hosting.md#running-on-your-own-server).
