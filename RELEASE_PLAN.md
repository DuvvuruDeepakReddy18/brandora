# Brandora full release plan

Completed on 16 November 2026. The application is live at https://brandora-omega-three.vercel.app, and source is pushed to the private repository https://github.com/DuvvuruDeepakReddy18/brandora. First-owner account creation is left to the owner using the local setup-code file.

1. Add a configured Gemini provider with structured, validated responses, durable daily request limits, deadlines and visible failures. Preserve deterministic checking and independent human approval.
2. Implement image/PDF OCR, an approved logo reference register and visual comparison, and translation with protected facts/terms, back-translation and a saved draft workflow.
3. Add deployment authentication/bootstrap, durable PostgreSQL, database-backed throttling, safe upload bounds, deployment health checks and CI. Keep secrets and local/demo records out of Git and cloud uploads.
4. Verify with isolated API tests, real provider calls on synthetic fixtures, PostgreSQL checks, frontend build and browser workflows.
5. Create a private Brandora GitHub repository under the authenticated account, push the reviewed source, provision the existing free Neon integration, deploy frontend and FastAPI to Vercel, and verify the live release.

Vercel Services is currently beta. The actual release uses its Next.js/FastAPI composition with dedicated Neon PostgreSQL. All 42 regression tests, frontend checks, GitHub CI and hosted AI/OCR/logo/translation/approval checks passed. No paid upgrade or domain was purchased. `docs/release.json` records the exact deployment and source revision.
