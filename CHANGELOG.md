# Changelog

All dates are IST (UTC+5:30, as recorded in the commit history). The full history is in `git log`.

## Round 3 · The finish (22–24 Nov 2026)

**The three committed improvements**
- **Measured, trustworthy findings.** An 80-item labelled evaluation (40 development, 40 held-out, 22 clean controls), computed by the production engine. A later fix and a fresh held-out round raised the total to 120 items (see the reliability improvement below). It is shown in Trust & Audit → Reliability and enforced in CI. Tone & messaging checks cite the approved brand voice guide.
- **Every format, page by page.**
  - Multi-page PDFs and PowerPoint decks open with page navigation, thumbnails with per-page counts, and zoom.
  - Accessibility findings in the same review: measured text contrast vs WCAG 4.5:1 / 3:1, small text, and missing or unhelpful alt text.
  - Documents are revised by uploading the corrected file.
  - There is a 10-page sample brochure, a corrected edition, and a 6-slide sample deck.
- **From repeated mistakes to clearer guidelines.**
  - Insights by rule, channel, campaign and team.
  - Rules are flagged as possibly unclear from reviewer overrides and needs-review volume.
  - Clarified rules are replayed on recorded history and applied only by a different manager, with an audit record.

**Reliability improvement (23 Nov)**
- The five round-1 held-out failures were fixed in the engine:
  - plan aliases
  - durations in words, weeks and months
  - exact capitalisation of product names
  - paraphrased mapped claims
  - "best regards" as a sign-off
  - prices written after the amount (added alongside, as a related gap)
- A fresh 40-item round 2 was written after the fixes and measured once: precision 93.5%, recall 93.5% (round 1 first run: 96.2% / 86.2%), 79/79 valid citations.

**Additions after a strict review of every claim**
- **Brand colour palette check:** measured colours on images, PDF pages and slides compared with the approved palette, as a judgement call with swatches and suggested replacements.
- **Check-before-publish API:** workspace API keys (hashed, revocable, rate-limited). `POST /api/v1/check` returns a verdict with evidence, can submit drafts for review, and never uses AI or approves ([docs/API.md](docs/API.md)).
- **Live claim checker:** [`scripts/verify_live.py`](scripts/verify_live.py), run daily against production by GitHub Actions.
- **Accessibility audit of Brandora's own screens:** 23 issues found and fixed; 24 screens now at 0 ([docs/accessibility-audit.json](docs/accessibility-audit.json)).
- **Fixes found by the live check:**
  - Judgement calls carry to corrected versions when the wording around them is unchanged.
  - Logo text is exempt from contrast.
  - Uncited AI suggestions no longer block approval.
  - AI no longer second-guesses rule-verified values.
  - Tone and accessibility rules can be created in the editor.
  - A busy AI provider (HTTP 500–504) is retried twice, after 1 s and 3 s, within the 55-second limit, and the message says the service is busy rather than pointing at configuration. Found when Gemini briefly returned 503 during the final live check.
  - If the main model is still busy, or its free daily quota is used up, a second free model (Gemini 3.1 Flash Lite, separate capacity and quota) answers. Configuration errors never switch models; each result names the model that produced it, and the AI status panel names the backup. No paid tier is used.
- **Faster demo start and image checks (24 Nov):** contrast and brand-colour measurement now work out each distinct colour once instead of once per pixel. Opening a demo went from 6.7 s to 1.8 s of server work in a local profile, and uploaded images and pages are checked faster. Results are identical: the old and new measurements were compared on every sample image, and the 94 tests pass.
- **Phone layout:** walkthrough cards stack in one column, an item's title gets its own row next to the back link, and long origin labels wrap, so no screen scrolls sideways at 375 px.
- **Landing without WebGL:** if a browser cannot start the 3D scene, it shows a still image of that same scene in place of the placeholder disc. A notice explains how to turn on graphics acceleration to see the interactive original. The approved landing source is unchanged; the fallback is added by the hosting layer.
- **Documentation:** [docs/RESPONSIBLE_DESIGN.md](docs/RESPONSIBLE_DESIGN.md), [docs/TESTING.md](docs/TESTING.md), [ROADMAP.md](ROADMAP.md) and the Round 3 report.

## Round 2 · The build (16–19 Nov 2026)

- **16 Nov:**
  - Governance app with validated AI, OCR, logo review and translation; hardened AI policy changes and language approval; provider failure diagnosis without exposing credentials.
  - Isolated, credential-free judge demos with safe role switching.
  - Interactive 3D landing with accessible motion.
- **17 Nov:** Brand Crew landing integrated with real sign-in and isolated demos; mobile login kept accessible; Brand Crew theme carried through the workspace.
- **18 Nov:**
  - Errors marked directly on creatives; reviewer decisions recorded.
  - Workspace rebuilt around six modules and an annotated review.
  - Inkloom AI evaluator walkthrough.
- **19 Nov:** Evaluator guidance for every role, feature and sample file; auto-playing landing story; live AI on by default in demos.

## Round 1 · The plan

Problem definition, users, solution, workflow, technology plan and responsible-design considerations (submitted as the Round 1 PDF).
