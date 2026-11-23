# Changelog

All dates are IST (UTC+5:30, as recorded in the commit history). The full history is in `git log`.

## Round 3 · The finish (22–23 Nov 2026)

**The three committed improvements**
- **Measured, trustworthy findings.** An 80-item labelled evaluation (40 development, 40 held-out, 22 clean controls), computed by the production engine. It is shown in Trust & Audit → Reliability and enforced in CI. Tone & messaging checks cite the approved brand voice guide.
- **Every format, page by page.**
  - Multi-page PDFs and PowerPoint decks open with page navigation, thumbnails with per-page counts, and zoom.
  - Accessibility findings in the same review: measured text contrast vs WCAG 4.5:1 / 3:1, small text, and missing or unhelpful alt text.
  - Documents are revised by uploading the corrected file.
  - There is a 10-page sample brochure, a corrected edition, and a 6-slide sample deck.
- **From repeated mistakes to clearer guidelines.**
  - Insights by rule, channel, campaign and team.
  - Rules are flagged as possibly unclear from reviewer overrides and needs-review volume.
  - Clarified rules are replayed on recorded history and applied only by a different manager, with an audit record.

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
