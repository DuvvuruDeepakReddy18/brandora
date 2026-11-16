# Brandora implementation plan

Started 16 November 2026. Build from the final 26-page proposal; all example brands, people and activity in the demo are fictional.

## Architecture and delivery

- Next.js, React and TypeScript frontend. Navy navigation, warm paper surfaces, teal evidence indicators and restrained editorial typography.
- FastAPI API with validated request models, server-side access checks and transactional persistence.
- SQLite for a self-contained local build; PostgreSQL via DATABASE_URL for deployment. Supabase Auth/RLS and hosted storage require a configured project and are not claimed by the local build.
- Rules-only checking works without credentials. An optional Claude adapter must validate citations and return uncertainty, never invent a factual verdict.
- Local runtime binds to loopback. A hosted deployment will need an API host, production database, secrets, HTTPS and email/account provisioning. Sites' Worker runtime does not directly host this Python API, so retain the proposal's separate frontend/API deployment design.

## Build order and acceptance

1. Foundation: sessions, password hashing, organisations, roles, campaigns, sources, facts/rules and audit events. All data access scoped by organisation; partners scoped to assigned campaigns.
2. Core lifecycle: create content, scan exact versions, inspect cited findings, correct and rescan, request review, prevent self-approval, issue immutable receipts, invalidate approvals after content/source changes.
3. Full workspace: source conflicts, claim lineage, knowledge-gap tasks, image contrast/palette checks, campaign comparison, dry-run impact/policy replay, historical receipts, decision-based learning, partner assignments and privacy controls.
4. Quality: test tenant boundaries, forged evidence, self-approval, stale scans, source changes, unrelated controls, dry runs, role restrictions and persistence. Compile and exercise the interface in a browser at desktop and mobile widths.

## Boundaries

Semantic checks need an explicitly enabled and configured provider. Automatic OCR, translations and logo recognition will not be shown as completed unless implemented and tested. Basic image checks use actual files and selected colours. No fake analytics, successful operations or fabricated user research. Unavailable capabilities must say so.

The official event page checked 16 November now lists Round 2 as 16–19 November and Round 3 as 21–24 November, each starting/ending 10:00 IST. This supersedes the previously observed dates; preserve the proposal as submitted and record this change here.

## Completion evidence

The local implementation now covers the foundation, core lifecycle and all 13 workspace areas at the bounded scope listed in README.md. Automated checks pass: 26 backend tests, TypeScript checking and a production build. The creator-to-reviewer approval flow, hypothetical impact replay, persisted records and desktop/mobile interfaces were exercised in the browser. See VERIFICATION.md for the observed results and their limits.

The subsequent full release implements configured Gemini review, image/scanned-PDF OCR, approved-reference logo recognition and protected-fact translation with independent language review. Production uses PostgreSQL, one-time workspace setup, database-backed request limits and secure sessions. See RELEASE_PLAN.md, DEPLOYMENT.md and the updated VERIFICATION.md for release progress. Arbitrary full-workspace historical reconstruction remains outside the supported history features.
