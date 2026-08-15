# RALYA website fast-edit system

This is the permanent editing workflow for the live RALYA website. Its purpose is to prevent a one-line website change from invoking the full Solana/protocol release process.

## Lane A — instant live-copy edits

Use `/owner/` → **Live website copy editor**.

- Requires a harmless message signature from the configured RALYA owner wallet.
- Stores approved plain-text overrides in the site-scoped Netlify Blobs store `ralya-site-copy` with strong consistency in production.
- No GitHub commit.
- No Netlify redeploy.
- No Solana build.
- No token/Mainnet action.
- New visitors read the current text immediately.
- Already-open public pages refresh approved live copy about every 30 seconds while the tab is visible and also refresh when the user returns to the tab.
- `web/site-copy.json` remains the version-controlled fallback/default content.
- **Reset all live overrides** returns the public site to the Git-controlled defaults.

The live-copy endpoint is intentionally allowlisted and plain-text only. It cannot change economics or security configuration, including:

- hard cap or presale cap
- price curve
- referral rate
- owner/treasury wallets
- USDC mint
- allocation access OPEN/PAUSED/CLOSED
- Mainnet Program ID, RLYA mint or sale PDA
- token distribution or minting

Current approved live-copy fields cover the major public section headings and introductory paragraphs: hero, purpose, RLYA, presale, build status, open source and engineering log.

## Lane B — normal website/design/code edits

For HTML/CSS/JS/layout or new website functionality, edit GitHub as normal. `.github/workflows/web-fast.yml` provides a website-only release gate.

The fast lane checks:

1. release/source safety assertions without rebuilding Solana;
2. pre-launch financial invariants;
3. live-copy safety;
4. pinned web/function dependencies;
5. presale economic self-test;
6. Netlify function compilation;
7. production browser bundle and JavaScript syntax.

It deliberately does **not** compile/deploy the Solana program or run the full 50,000-operation/protocol pipeline for ordinary website-only changes.

Rapid successive pushes to the same website branch cancel the previous web-fast run so edits do not queue behind obsolete versions.

## Lane C — protocol/economic changes

Only use the full repository/Solana gates when changing protocol source, tokenomics, economic model, Mainnet scripts, tests or other security-critical blockchain files. The full `Repository checks` and `Build` workflows remain for that work.

## Netlify production behavior

The existing Netlify project is `ralya-network`, site ID `aeca50d3-428e-4300-9c7f-668d219dc0bc`, Git-connected to the repository. Website releases should normally be made by updating `main`; Netlify then publishes the complete static site **and** its Netlify Functions. Do not manually upload only the `web/` directory for a financial release because the pre-launch payment-verification backend lives under `netlify/functions/`.

## Editing rule for future chats

Before touching GitHub for a requested wording change, first ask internally whether it fits the owner live-copy allowlist. If yes, use the live-copy system rather than rebuilding/redeploying. If it is HTML/CSS/JS or outside the allowlist, use the web-fast GitHub lane. Use full Solana/protocol CI only when the actual protocol/economics/security code changes.
