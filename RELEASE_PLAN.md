# Brandora full release plan

1. Add a configured Gemini provider with structured, validated responses, durable daily request limits, deadlines and visible failures. Preserve deterministic checking and independent human approval.
2. Implement image/PDF OCR, an approved logo reference register and visual comparison, and translation with protected facts/terms, back-translation and a saved draft workflow.
3. Add deployment authentication/bootstrap, durable PostgreSQL, database-backed throttling, safe upload bounds, deployment health checks and CI. Keep secrets and local/demo records out of Git and cloud uploads.
4. Verify with isolated API tests, real provider calls on synthetic fixtures, PostgreSQL checks, frontend build and browser workflows.
5. Create a private Brandora GitHub repository under the authenticated account, push the reviewed source, provision the existing free Neon integration, deploy frontend and FastAPI to Vercel, and verify the live release.

Vercel Services is currently beta. The release will use its documented Next.js/FastAPI composition if supported by this account; deployment records will state the actual topology. No paid upgrade or domain purchase is included.
