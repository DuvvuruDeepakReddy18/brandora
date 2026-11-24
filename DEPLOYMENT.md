# Brandora deployment

Target: the authenticated owner's new private Brandora GitHub repository and Vercel project `brandora`, in team `duvvurudeepakreddy18s-projects`.

Published: https://brandora-omega-three.vercel.app

Repository: https://github.com/DuvvuruDeepakReddy18/brandora (public).

The current production deployment is `dpl_BQfX82zNCY6gMz6VL4JrBnpLSUCt` (24 Nov 2026), built from application commit `bef32ff`. It was staged, checked, then promoted. Later documentation/verification-script commits do not change that deployed application revision. See `docs/release.json` and the verification reports for exact results.

## Architecture

Vercel Services builds Next.js and FastAPI independently and routes `/api/*` to Python and the remaining paths to Next.js. Services is beta. Neon PostgreSQL stores accounts, sessions, source versions, content, approval receipts, logo references, translations, request quotas and audit records. No mutable state relies on the function filesystem.

The dedicated database was provisioned using the existing Neon `free_v3` integration in `iad1`; no paid plan or custom domain was purchased. Configuration secrets are stored in Vercel's sensitive production variables. The user explicitly approved transferring the existing Gemini key and generated one-time setup code to this project.

## First workspace

Open the deployed website, choose **Sign in**, then **Create your workspace** when first-owner setup is available. Enter your own name, email, a password of at least 12 characters and the code in the local, Git-ignored `deployment-access.txt`. Setup closes after the first real account exists. Demo visitors do not consume first-owner setup. The code is not included in the repository or application bundle.

As the manager, create a campaign, register approved sources and rules, add teammates in Partner Workspace, and enable AI services in Privacy & settings when ready. AI features require that explicit workspace switch even though the provider is configured.

## Judge access

**Explore demo** creates or resumes a private two-hour sandbox in PostgreSQL, using a separate HTTP-only token and a server-held whitelist of four sample role accounts. It preserves the owner's normal session cookie. Role switching, sample downloads, reset and expiry operate only on that sandbox. Ordinary password login rejects demo accounts; demo member emails are confined to a fictional namespace.

The demo entry is enabled by default and can be disabled with `BRANDORA_EXPLORE_DEMO=0`. Keep `BRANDORA_DEMO=0`: that flag controls the older shared development login, which remains unavailable in production. Demo AI is opt-in, capped at 12 requests/session/day and 80 total demo requests/day, within the existing global cap. The shared demo cap is configurable through `BRANDORA_DEMO_AI_GLOBAL_LIMIT`.

Creation limits are 12/client/hour and 200/day globally; demo mutations are capped at 250/session. On Vercel only, the creation limiter uses the platform-overwritten `x-vercel-forwarded-for` header ([Vercel request headers](https://vercel.com/docs/headers/request-headers)); other hosts use the socket peer. No raw client address is stored. Expired demos are inaccessible immediately and cleaned up in batches of five when a new demo is created. See [JUDGES.md](JUDGES.md) for evaluator instructions.

## Release checks

1. Run API regressions, TypeScript and the production build.
2. Review `git diff --cached` and run `python scripts/check_release.py` before a push.
3. Stage production with `vercel deploy --prod --skip-domain` in the linked project. Verify the exact source revision and team before publishing.
4. Check the staged health endpoint and login UI, then promote that tested deployment.
5. Verify the public health endpoint, production demo denial, authenticated routes and browser behavior. Record URL, commit and status in `docs/release.json`.

Automatic deployment is intentionally not used as a substitute for CI passing. Future release configuration must retain tested-commit checks. Preview environments must use their own database, provider limits and setup secrets; production credentials are not copied to previews.

## Operations

- Health: `/api/health` checks database connectivity and exposes only capability/status metadata. Structured provider failures return user-safe messages; no API keys or provider response bodies are logged.
- Model calls share a 55-second deadline, with at most one retry for HTTP 500/502/503/504; function duration is capped at 120 seconds. Daily global/workspace request caps are database-backed. A retry may make two provider attempts for one application request; a provider-side spend cap is independent of these request limits.
- Workspace changes use transactions and per-workspace PostgreSQL row locks. Startup schema additions are serialized with a PostgreSQL advisory lock and are additive; destructive migrations require a separately reviewed migration.
- Keep database backups/restore points through the database provider. Do not run regression tests against the production schema. The PostgreSQL verification script creates and removes a uniquely named isolated schema.
- Monitor Vercel error logs, Neon compute/storage and Google API quota/billing. No paid monitoring or log drain is configured by this release.
- `python -m backend.manage` can provision a manager interactively in an appropriately configured server environment. Account recovery is administrator-operated; no email-recovery service is implied.

For a rollback, promote the previous known-good Vercel deployment. Additive schema changes are compatible with this release, but review migration compatibility before rolling back future releases.
