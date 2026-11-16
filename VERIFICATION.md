# Brandora verification — 16 November 2026

## Credential-free judge demo

- 52 local regressions pass, including visitor/owner isolation, blocked cross-workspace reads and writes, creator-to-reviewer approval, partner scope, owner-session preservation, reset, expiry, forged cookies, ordinary-login denial for demo credentials, fictional member emails and shared AI/action caps.
- The browser exercised Explore demo, corrected the sample draft as creator, approved version 2 as reviewer, used the AI-settings shortcut and returned to the original workspace. The 390-pixel mobile layout was checked, then the viewport override was reset. No browser errors were recorded.
- TypeScript and the production frontend build pass. GitHub CI passed for application commit `4ae7a8958748fd872fb2833ab9394a8ddee81f11` (run `43886706402`).
- PostgreSQL: seven of the eight initial demo cases passed; the remaining case encountered an SSL transport failure, and its first isolated retry encountered a DNS failure. A clean rerun of the owner-session/reset case passed in 114.70 seconds. Temporary schemas were removed in all runs. The two additional limit regressions passed locally; no claim is made that the complete 52-test suite was rerun on PostgreSQL.
- Hosted verification on `dpl_BKWqvefUWap9ZhC5FG5nRmE5q9Lk` passed two independent anonymous visitors, denied cross-workspace access, creator/reviewer approval, partner scoping, live Gemini review, Hindi translation, image OCR/logo comparison, scanned-PDF OCR and correct AI usage accounting. Both synthetic sandboxes were reset and subsequent access returned 401. See `docs/judge-demo-verification.json`.
- That exact deployment was promoted to the public domain. Public routing/access checks passed, with `explore_demo=true`, legacy `demo=false` and owner setup closed. A final deployment error-log query returned no matching logs.
- A fresh public browser opened the live **Explore demo** button without credentials, entered its own sample workspace, switched to reviewer and back to creator, and displayed the walkthrough and controls correctly. No browser errors were recorded. Screenshots: `docs/explore-demo-entry.jpg` and `docs/explore-demo-workspace.jpg`. This browser sandbox remains available for the owner's preview until it expires; the two API-test sandboxes were removed.

## Full release verification

- Expanded regression suite: **42 passed** using the dedicated pinned Python 3.12 environment; external provider calls are disabled in this suite. One upstream Starlette warning reports that its HTTPX TestClient adapter is deprecated; it does not affect the running API.
- Next.js route type generation, TypeScript checking and production compilation pass.
- Live Gemini 3.5 Flash-Lite verification passed for image OCR, approved-reference logo matching, Hindi translation with protected facts, scanned-PDF OCR and source-cited semantic review. Inputs were generated fictional fixtures only. Exact accepted outputs are in `docs/provider-verification.json`.
- An initial semantic response incorrectly quoted the draft as its evidence; the validator rejected it and prevented silent approval. Clarifying the source/draft field contract produced a valid cited response. Rejected output was never treated as evidence.
- Browser verification registered a synthetic approved logo, uploaded a synthetic creative and received actual OCR text, a matched logo location and suggested alt text. `docs/visual-analysis.jpg` captures the result.
- PostgreSQL: the 35-test suite passed in 693.55 seconds in a unique isolated schema. The final translation/schema case passed in a fresh schema (96.57 seconds), as did both final approval-policy regressions (126.29 seconds). All temporary schemas were removed; production records were not used.
- The browser generated a Hindi translation, displayed its English back-translation and preserved HarborDesk, 14 and ₹499/month, then saved a separate draft. It did not automatically approve the translation.
- GitHub Actions passed for deployed commit `8b0cae4fdd37be34198ce996c9676a067df27b94` (run `43867159086`). The Vercel production build passed and the exact tested deployment was promoted.
- Hosted verification passed actual Gemini semantic review, independent approval with a SHA-256 receipt, Hindi translation saved as a separate language-review-required draft, approved-reference logo recognition, image OCR and scanned-PDF OCR. The synthetic workspace and its records were removed afterward. See `docs/cloud-verification.json`.
- The public domain returned HTTP 200 for the frontend and healthy API, HTTP 401 for an unauthenticated workspace, HTTP 404 for production demo login and HTTP 403 for an incorrect setup code or disallowed origin. First-owner setup remains available. See `docs/public-verification.json`.
- The published site was opened in the browser and its protected first-workspace form was inspected visually. No browser errors were recorded. `docs/live-workspace-setup.jpg` captures the public screen; no account or password was created for the owner. The final deployment error-log query returned no matching error logs.
- Secret scanning checks staged source and confirms the database, environment files, setup code and provider key are excluded.
- Hosted testing caught a temporary provider HTTP 503. The final adapter retries HTTP 500/502/503/504 once within the existing deadline, and exposes only fixed diagnostic messages. Tests verify recovery, decreasing request deadlines and exclusion of raw provider data and credentials from errors.

The following records describe the initial rules-only build and are retained as earlier verification, not current feature limitations.

## Automated checks

| Check | Observed result |
| --- | --- |
| `python -m pytest backend/tests -q` | 26 passed in 5.79 seconds |
| `npm run typecheck` | Passed; no TypeScript errors |
| `npm run build` | Passed; optimized production build and static page generation completed |

The API suite uses an isolated temporary SQLite database. It covers authentication, tenant and campaign isolation, author/last-editor approval restrictions, exact content hashes, version conflicts, cited findings, unsupported claims, source-change invalidation with an unaffected control, non-mutating hypothetical impact replay, import review requirements, rejected blank PDFs, invalid configuration, contrast calculations, unsafe image rejection, cross-site writes, invalid AI citations and payload redaction.

## Browser checks

The local application was exercised through the visible browser at desktop width and a 390 × 844 mobile viewport. The viewport override was reset afterward.

- Signed in as the fictional creator, corrected the four-finding launch draft, saved version 2, checked it with zero remaining findings and requested review.
- Signed in separately as the fictional reviewer and approved that exact version. The saved approval receipt and version appeared in the interface.
- Inspected Claim DNA and confirmed three connected content items for the pricing fact.
- Replayed a hypothetical price change from 499 to 599. The UI showed three affected items, each changing from zero to one finding, while the existing approval remained Approved. The response explicitly labels the results as projections.
- Checked the mobile dashboard, content layout and navigation drawer. Closed mobile navigation is excluded from the accessibility tree; opening and closing it works.
- Reloaded after the final API restart and confirmed saved content and approval persisted.
- Browser error log inspection returned no recorded errors for this tab at the end of those checks.
- Returned the visible workspace to the fictional manager account for exploration.

The demo database retains the tested launch draft at approved version 2. These are fictional development records, not user research or evaluation results.

## Limits of this verification

At the initial build, only local functional behavior had been verified. The full-release section above supersedes that build's AI/OCR/logo/translation status. Neither verification run is a security audit, a large-scale concurrency certification, the proposal's held-out product evaluation, or a user study. Email delivery and managed external identity are not part of this release.

See README.md for implemented module boundaries and DEPLOYMENT.md for first access and operating instructions.
