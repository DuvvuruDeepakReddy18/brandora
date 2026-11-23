# Testing, reliability and what testing changed

Brandora is checked at five levels. Each runs automatically or can be re-run by anyone with the repository.

| Level | What it proves | How to run | Latest result |
|---|---|---|---|
| Backend regression tests | Workflows, permissions, isolation, every check type, the API and the demo | `python -m pytest backend/tests -q` (CI on every push) | 84 passed |
| Labelled evaluation | How accurate the rule engine is on content it was not tuned on | `python -m backend.evaluation` (CI fails if scores drop or the published report is stale) | Held-out precision 96.2%, recall 86.2%; citation validity 50/50; 1 of 22 clean controls flagged |
| Live claim check | Every documented claim works on the production URL, as an evaluator would use it | `python scripts/verify_live.py https://brandora-omega-three.vercel.app --ai` (scheduled daily in GitHub Actions, rules only) | All claims passed ([`live-verification.json`](live-verification.json)) |
| Accessibility audit | Brandora's own screens meet a WCAG 2.2 AA subset | [`scripts/a11y-audit.js`](../scripts/a11y-audit.js) in the browser | 24 screens, 0 issues ([`accessibility-audit.json`](accessibility-audit.json)) |
| Build checks | Types, production build, landing integrity | `npm run typecheck`, `npm run build`, `node scripts/prepare-brand-crew.cjs --check` | Passing in CI |

## Labelled evaluation (Round 3)

- **The set:** 80 items of fictional Inkloom AI content, labelled by what a reviewer should conclude ([`backend/eval/dataset.json`](../backend/eval/dataset.json)). There are 40 development items, used while building the checks, and 40 held-out items, written after the checks were frozen. 22 items are clean controls.
- **How it runs:** [`backend/evaluation.py`](../backend/evaluation.py) runs the production engine against the same register the demo uses.
  - A finding is correct when its rule, outcome and location match a label.
  - Precision = correct ÷ raised; recall = correct ÷ labelled.
  - Citation validity checks that every shown finding names the current approved source, and that the source text contains the cited value or words.
- **The five held-out failures are reported, not tuned away.** Each is a concrete next improvement:
  - "Pro" as an alias for Professional
  - "a month" written in words
  - "Inkloom Ai" capitalisation
  - "80 percent" vs "80%"
  - "Best regards" flagged as a superlative
- **In the app:** Trust & Audit → Reliability shows the same report, re-run when the page opens.

## What testing changed (selected)

| Found by | Problem | Change |
|---|---|---|
| Development evaluation items | A sentence naming two plans attributed both prices to both plans | Prices are attributed by clause when a sentence states several amounts |
| Live claim check | Following the walkthrough (accept the GST note, then fix the price) re-raised the question and blocked approval | Judgement calls carry to a corrected version when the surrounding wording is unchanged, labelled "carried over" |
| Live claim check with live AI | The corrected ad got contrast findings from the logo's own lettering and a grey footer | Logo text is exempt from contrast (as in WCAG); the sample footer was darkened |
| Live claim check with live AI | One uncitable AI suggestion marked the whole check "AI incomplete" and blocked approval | Uncited suggestions are hidden and counted; only provider failures or limits block approval |
| Live claim check with live AI | AI attached suggestions to prices the rule engine had verified | AI suggestions on rule-verified values are dropped |
| Strict review | Managers could not create tone or accessibility rules from the editor | The rule editor lists every rule type |
| Accessibility audit | 23 contrast and heading issues on Brandora's own screens | Status colours and muted text darkened, headings fixed |
| CI on Linux | Published report hashes differed between Windows and Linux line endings | Hashes are computed on normalised line endings |
| Browser verification | Tall PDF pages pushed the page thumbnails below the fold | Pages are capped to the viewport height |

## Earlier rounds

- **Round 2:** 64 regression tests. Production API flow verified, including refusals: author decisions (403), contradiction rejection (409), self-approval (403). Live Gemini OCR re-read of the sample image.
- **Round 2 records:** [`VERIFICATION.md`](../VERIFICATION.md), [`DEPLOYMENT.md`](../DEPLOYMENT.md), [`docs/release.json`](release.json).

## Not claimed

- No load test, penetration test or formal user study.
- The evaluation set is synthetic and team-labelled. It measures the rule engine, not live AI suggestions.
