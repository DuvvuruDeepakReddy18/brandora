# Privacy, security, accessibility and responsible design

Brandora checks content before it is published. It handles unreleased campaigns, prices and brand assets, and it uses AI in places. This document says how that is done safely, what is disclosed, and where the limits are. Every claim links to the code that implements it.

## 1. Human control and explainable results

- **Deterministic first.** Prices (including Indian digit grouping and plan-specific prices), trial lengths, product names, prohibited and required wording, mapped claims, tone rules, accessibility measurements and colour measurements are checked by a rule engine ([`backend/engine.py`](../backend/engine.py)). Every finding names the rule, the approved source, its version and the exact words it relies on.
- **Evidence-gated.** A tone, accessibility or colour check stays silent unless the words it cites appear in the approved source text. A rule whose value is missing from its source produces "Source needs review", not a verdict.
- **Evidence gaps are not "false".** A claim with no approved support is marked *Unverified* (orange), never *false*. Unmapped superlatives and percentages become yellow judgement calls.
- **AI assists, people decide.** AI reads images (OCR), compares logos and suggests wording issues. A suggestion is shown only if it quotes an approved source exactly ([`validate_ai`](../backend/engine.py)). It is always a blue judgement call, never red. AI suggestions are not shown when they repeat a rule finding, or when they second-guess a value the rule engine verified.
- **Approval is human, independent and exact.** Authors and last editors cannot approve their own work. Approval binds to a SHA-256 hash of the exact version and the source versions it relied on. Any edit, alt-text change or source change ends the approval.
- **Judgement calls carry only when the wording is unchanged.** A reviewer's accept/reject on a judgement call carries to a corrected version only if the same rule raises the same question with identical surrounding wording. It is labelled "carried over", and a reviewer still approves the version.
- **Rule changes need a second person.** A clarified rule is replayed on recorded history (predicted vs what reviewers actually decided). It is applied only by a manager who did not propose it, with an audit record ([`backend/insights.py`](../backend/insights.py)).
- **No silent success.** If OCR or the AI provider fails, nothing is saved and the screen says so. If a daily AI limit is reached, the rule checks still complete and the result is marked *AI incomplete*, which blocks approval until it is retried or AI is turned off.
- **Measured reliability is published.** See [TESTING.md](TESTING.md): 120 labelled items with two held-out rounds (round 1 measured, its misses fixed, then a fresh round 2 measured), every miss explained, re-run in CI.

## 2. Privacy

- **AI is a workspace setting.** A manager turns AI on or off in Trust & Audit → Privacy & AI. Real workspaces start with AI off. Demo workspaces (fictional data) start with it on, and the demo bar says so. Turning AI on or off invalidates prior scans, so approvals never rest on a check made under a different policy.
- **Exactly what is sent, and when.** When AI is on, these go to the configured provider (Google Gemini; Anthropic is supported for text-only features):
  - **Text review:** the text being checked, plus the approved rule values and source excerpts that apply to it, so suggestions can cite them. Email addresses and phone numbers are masked in both (`mask` in [`backend/ai.py`](../backend/ai.py)).
  - **Image reading and logo comparison:** the image or scanned page, plus the approved reference logos it is compared with ([`inspect_visual`](../backend/intelligence.py)). Images cannot be masked.
  - **Translation:** the text, with contact details and approved names replaced by placeholders.
  - **Never sent:** rule checks, document parsing, contrast and colour measurements, the check-before-publish API, decisions, users and the audit trail. A manager can turn AI off in Trust & Audit → Privacy & AI to keep every check on Brandora’s server; the same list is shown there.
  The API key stays on the server, and calls are server-side only. The provider is told to treat content as data, never instructions.
- **The rule engine needs no AI.** Text, PDF, PowerPoint, DOCX, accessibility and colour checks run on Brandora's own server. The check-before-publish API never sends text to an AI provider.
- **Image metadata is stripped.** Uploaded images are re-encoded (orientation applied, metadata dropped) before storage or analysis ([`normalize_image`](../backend/intelligence.py)).
- **Workspace isolation.** Every query is scoped to the signed-in user's organisation on the server. Partners are limited to assigned campaigns by the API, not just hidden in the interface.
- **Deletion.** Deleting content removes its text, versions, creatives, page images and the text in its finding history. Receipt hashes and audit metadata are kept so the record stays accountable.
- **Demo sandboxes.** Each visitor gets an isolated, fictional workspace that expires after two hours and is removed. Seeded history is labelled fictional.
- **People are not scored.** Guideline insights group contributors as *Internal team* or *Partner agencies*. They never rank or name individuals (tested in [`test_round3.py`](../backend/tests/test_round3.py)).
- **No third-party tracking** scripts or analytics run in the workspace.

## 3. Security

| Area | Control |
|---|---|
| Accounts | Passwords hashed with scrypt (n=16384) and a per-user salt; minimum 12 characters; login rate-limited (20 attempts per 10 minutes per email) |
| Sessions | Random 40-byte tokens stored as SHA-256 hashes; httpOnly, SameSite=Lax cookies (Secure in production); 8-hour expiry |
| Cross-site requests | Every write checks the `Origin` against an allow-list and rejects `Sec-Fetch-Site: cross-site` |
| Authorisation | Roles (manager, creator, reviewer, partner) checked on the server for every action; records fetched through an organisation-scoped `get()`; self-approval and self-decision refused |
| API keys | Created by managers, shown once, stored as SHA-256 hashes, revocable, rate-limited per key (120/min, 5,000/day; 30/min and 200/day in demos), every call audited |
| Uploads | 3 MB limit; images up to 8 megapixels with a decompression-bomb guard; PDFs and decks up to 20 pages; DOCX/PPTX XML with DOCTYPE or ENTITY declarations rejected |
| AI | Structured, schema-validated outputs; 55-second deadline; daily caps per workspace, per demo and globally; untrusted content isolated from instructions |
| Headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`; API docs disabled in production |
| Secrets | Provider keys and the database URL are Vercel sensitive environment variables; none are in the repository (a secret scan runs before each release) |
| Data | Production requires PostgreSQL (Neon); schema changes are additive and run under an advisory lock |

Not claimed: no penetration test or formal threat-model review has been done. Account recovery is administrator-operated.

## 4. Accessibility

**What Brandora checks in your content.** Measured text contrast on images, PDF pages and slides against WCAG 4.5:1 (3:1 for large text), with the ratio and a passing colour. Logo text is exempt, as WCAG allows. It also checks body text under 9 pt and missing or unhelpful alt text. Alt text is part of the reviewed version.

**Brandora's own screens.** We audited 24 workspace screens across all four roles with a self-contained WCAG 2.2 AA audit ([`scripts/a11y-audit.js`](../scripts/a11y-audit.js); results in [`docs/accessibility-audit.json`](accessibility-audit.json)).

- **Before:** 23 issues. These were 20 low-contrast texts, including status colours used as text on their own tint, plus a highlighted-row contrast issue and two heading-level skips.
- **After:** 0 issues across 4,076 checked elements.
- **Also verified:** a "Skip to content" link, `lang="en"`, a visible 2 px focus outline, reduced-motion support, and no horizontal overflow at 375 px.
- **Limits:** an automated audit cannot judge alt-text quality, reading order or screen-reader announcements; that needs a manual screen-reader pass (on the roadmap). The public landing page is the approved design and was not changed.

## 5. Disclosure

- **In the product:** every AI output is labelled with its source (for example *Analysed with gemini · gemini-3.5-flash-lite*, *AI suggestion*). When the free backup model answers because the main one is busy, the label names the backup. Demo sample data is labelled *DEMO SAMPLE*. Seeded history is labelled fictional.
- **External services:** Vercel (hosting), Neon (PostgreSQL), Google Gemini (optional AI). Libraries are pinned in [`backend/requirements-lock.txt`](../backend/requirements-lock.txt) and `package-lock.json`. The PDF renderer is PDFium via `pypdfium2`.
- **Development:** Codex and Claude Code assisted planning, implementation, testing and deployment. All sample companies, people, campaigns and figures are fictional.
