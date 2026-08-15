# RALYA fast website editing

RALYA deliberately separates website work from protocol work. A one-line wording change must not trigger a Solana rebuild.

## Lane 0 — instant live copy, no GitHub and no deploy

The private `/owner/` console contains **Live website copy editor**.

It changes only approved plain-text marketing fields through `/api/site-content`. The owner signs a harmless wallet message; the server verifies the configured owner wallet and stores the override in Netlify Blobs. Public pages read the override on refresh.

This is the fastest path for a wording change while the site is already live.

Live-copy overrides cannot change price, hard cap, referral rate, wallets, treasury settings, presale access, Mainnet IDs, token supply or transaction logic.

Use **Reset all live overrides** to return to repository defaults.

## Lane 1 — tiny permanent copy edit

Permanent marketing copy lives in:

`web/site-copy.json`

For a simple wording change, edit **only this file** whenever possible.

A `site-copy.json` change runs the lightweight **Copy release** workflow only:

- JSON parse validation;
- live-copy boundary audit.

It does not install Node packages, run the 50,000-operation stress test, build Solana SBF or run the full repository gate.

This is the default assistant/GitHub path for one-line or paragraph copy changes that should become permanent.

## Lane 2 — website code, layout, style or Netlify-function edit

Real website changes use the **Web release** workflow. It covers `web/**` except `web/site-copy.json`, Netlify functions and web build files.

It runs:

- pre-launch financial/web audit;
- live-copy audit;
- cached pinned Node dependencies;
- pre-launch economic self-test;
- Netlify function compilation;
- production browser bundle build.

It does **not** build the Solana program.

Newer web runs cancel older in-progress web runs on the same branch so several quick revisions do not queue behind each other.

## Lane 3 — protocol/economics/security-sensitive change

Only protocol-sensitive paths trigger the heavyweight repository/Solana workflows, including:

- `programs/**`;
- `model/**`;
- `tokenomics/**`;
- protocol tests;
- Solana deployment/security scripts;
- Cargo/Anchor configuration.

These remain intentionally slow and heavily verified.

## Rule for future ChatGPT sessions

When the owner asks for a website wording change:

1. first check whether the text is represented in `web/site-copy.json`;
2. if yes, change only `web/site-copy.json` unless the owner explicitly wants a structural/UI change;
3. do not touch token economics or `web/site-config.js` just to change wording;
4. do not run/await Solana CI for a copy-only edit;
5. for temporary/immediate copy, prefer the signed owner live-copy editor;
6. for HTML/CSS/JS/function changes, use the Web release lane;
7. reserve full protocol CI for actual protocol/economic changes.

This separation is part of the production architecture, not a shortcut around safety.
