# Brandora

[Live application](https://brandora-omega-three.vercel.app) · [Private GitHub repository](https://github.com/DuvvuruDeepakReddy18/brandora)

The public entry is **Brandora — The Brand Crew**, with the four-robot interactive introduction, real login and isolated demo entry. The dashboard and all 13 internal pages continue its paper surfaces, cobalt controls, editorial typography and four crew colours. See [landing integration](docs/BRAND_CREW_INTEGRATION.md), [workspace design and verification](docs/WORKSPACE_THEME.md) and [landing release verification](docs/brand-crew-integration-verification.json). Previous design editions are retained as source history.

**Judges:** choose **Explore demo** for a private, temporary sample workspace with creator/reviewer/manager/partner switching. No credentials are needed. See [JUDGES.md](JUDGES.md) for the walkthrough and demo limits. Normal workspace login remains separate.

For first access, choose **Create your workspace** and use the private code in the local `deployment-access.txt`. Create your own password, then enable AI in **Privacy & settings**. The setup code is not stored in this repository.

An evidence-connected brand governance application: draft, inspect, correct, request review and approve an exact version. Next.js/React/TypeScript frontend, FastAPI backend, PostgreSQL in production and SQLite for local development.

## Product

All 13 proposed workspace areas have working implementations:

| Area | Implementation |
| --- | --- |
| Rulebook & Fact Vault | Approved source excerpts, owners, review dates, version history and scoped structured rules; text import from PDF/DOCX/TXT/Markdown. |
| Evidence Gate | Deterministic checks plus optional Gemini/Anthropic semantic review. Exact source/claim spans are validated. Unsupported claims remain unverified. Untraceable AI responses block approval. |
| Contradiction Hunter | Conflicting approved structured facts are surfaced for an owner decision, with no invented factual verdict. |
| Claim DNA | Source → rule → content dependencies, including clean content, with targeted reassessment when evidence changes. |
| Knowledge Gaps | Evidence-owner tasks generated from unsupported mapped claims. High-risk gaps cannot be dismissed into approval. |
| Visual Guardian | Palette and selected-colour contrast; Gemini image/PDF OCR; approved logo reference register; logo match/modified/not-found/uncertain comparisons with location overlays; suggested alt text. |
| Approval Integrity | Separate author/reviewer, last-editor restriction, current scan and evidence checks, SHA-256 receipts and immutable approval snapshots. |
| Campaign Consistency | Cross-channel checking against one scoped source register. |
| Impact Lab | Hypothetical rule replay with clearly labelled projections; live source and approval state is unchanged. |
| Time Machine | Historical approval snapshots, source versions, content history and audit trail. |
| Learning Loop | Actual rule-level findings and human review reasons, without fabricated trends or personal scoring. |
| Partner Workspace | Manager-provisioned role accounts and explicitly assigned campaign access, enforced by the API. |
| Privacy Centre | Workspace AI switch, provider/usage visibility, data export, content-payload redaction and retained audit metadata. |

Translation supports English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Marathi, Gujarati, Spanish, French, German, Portuguese, Arabic, Japanese, Korean and Chinese. Approved names, numeric facts and contact details are protected by placeholders; missing placeholders or changed numeric values reject the result. Review the translation and English back-translation before saving a separate draft. A reviewer other than the author/last editor must record a language review before approval, including translations into English.

AI is assistance, not independent truth. OCR can misread text; logo comparison is visual similarity, not legal authenticity; back-translation does not establish linguistic correctness. All generated content and extracted sources require human review. Full-workspace historical reconstruction, automated publishing, email notifications and semantic resolution of arbitrary contradictory documents are outside this release.

## Run locally

Use Node 22+ and Python 3.12:

```powershell
npm ci
python -m venv .venv-app
.\.venv-app\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
.\Start-Brandora.ps1
```

Open http://127.0.0.1:3200. The startup script launches hidden loopback-only processes and writes `api*.log` and `web*.log`. Alternatively run `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8200` and `npm run dev` in separate terminals with the virtual environment activated.

Local records persist in `data/brandora.db`. The four legacy demo accounts and HarborDesk examples are fictional. The shared development login is disabled in production; **Explore demo** uses separate, expiring visitor workspaces instead. Local browser verification may leave the launch draft at approved version 2; create another draft to repeat the workflow.

Set the backend environment variables from `.env.example` in the API process. Next.js `.env.local` is not automatically loaded by Python. Gemini defaults to `gemini-3.5-flash-lite`; set `GEMINI_API_KEY`, then enable AI services as a manager. The key stays on the server. Anthropic remains supported for text review/translation when its key and model are configured; image/PDF features currently require Gemini.

## Data and request boundaries

- AI sends only applicable text context or the image/PDF explicitly selected for analysis. Text review masks email and phone details. OCR files cannot be masked before recognition. Uploaded originals are not retained by Brandora; resized approved logo references are stored privately in PostgreSQL. Provider retention is governed by the provider account's terms.
- Default AI limits: 30 requests/workspace/day and 200 requests/application/day, UTC. Counts are committed atomically in the database before inference, including failed calls. These are request caps, not guaranteed currency budgets; configure a provider billing limit separately if needed.
- Uploads: 3 MB; images at most 8 megapixels for AI, 4 megapixels for palette checks; scanned PDFs at most 10 pages. Ordinary PDF text extraction accepts up to 20 pages. Extracted text is bounded to 12,000 characters.
- Production uses persistent PostgreSQL, secure HTTP-only session cookies, origin checks, database-backed login throttling, private tenant queries and workspace mutation locks. First-user setup requires a secret and closes after the first account is created. Managers provision subsequent users. Password recovery is administrative, not email-based.
- Content deletion redacts its saved payloads, translation results and receipt bodies while preserving audit identifiers. Separately saved translated drafts are separate content records and can be deleted individually.

## Verification

```powershell
.\.venv-app\Scripts\python.exe -m pytest backend/tests -q
npm run typecheck
npm run build
```

The regression suite never calls an external model and uses an isolated temporary database. See [VERIFICATION.md](VERIFICATION.md) for observed results. `scripts/verify_provider.py` is an explicit opt-in live check using synthetic fixtures only. `scripts/verify_postgres.py` uses a unique disposable schema in the configured database and removes only that schema afterward.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md). `vercel.json` composes the Next.js frontend and FastAPI backend as Vercel Services (currently beta). Production persistence is a dedicated Neon database on the existing free plan. PostgreSQL is required; the application refuses ephemeral production SQLite. A standalone API Dockerfile is also included.

GitHub CI verifies the API, TypeScript and production build. Secrets, `.vercel`, local database files and `deployment-access.txt` are excluded from source control and deployment uploads. No real user data from the local demo or proposal is uploaded.

This release has functional and provider verification, not a penetration-test or large-scale load-certification claim. Operating it requires monitoring provider/cloud quotas, restoring backups when needed, managing users and reviewing AI outputs. The engineering tests are not the proposal's planned user study or held-out product evaluation.

AI assistance disclosure: Codex assisted planning, implementation, testing and deployment. Framework and package dependencies are declared in the lockfiles. The submitted proposal and Google Drive folder were not modified by this implementation.
