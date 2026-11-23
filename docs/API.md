# Check-before-publish API

Connect Brandora to the place content is published from (a CMS, a publishing webhook in Zapier or Make, or a deploy pipeline). Before anything goes live, that system sends the copy to Brandora and gets a verdict with the evidence behind every finding.

- **Rules only.** The API runs the deterministic checks against your Company Hub. It never sends text to an AI provider.
- **Never approves, never publishes.** A `clear` verdict means no issue was found in the checked rules. Approval stays a separate, human step in Brandora.
- **Keys are workspace-scoped and stored as hashes.** A manager creates keys in **Trust & Audit → Integrations**. The full key is shown once. Every call is written to the audit trail (key name, verdict, finding count; not the text).

## Try it in the demo

1. Open the live app, choose **Explore demo**, and switch to **Manager** in the demo bar.
2. Go to **Trust & Audit → Integrations** and choose **Create API key**.
3. Choose **Send test request**. The sample copy comes back `blocked`, with the wrong trial length and price and their approved values.

Demo keys stop working when the demo workspace expires (two hours) and are limited to 30 calls a minute and 200 a day.

## Request

```http
POST /api/v1/check
Authorization: Bearer brk_your_key
Content-Type: application/json
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `text` | string, 1–5,000 characters | yes | The copy to check |
| `channel` | `Website`, `Email`, `Social` or `Advertisement` | no (default `Website`) | Rules can apply per channel |
| `subject` | string | no | Product the copy is about. Defaults to the workspace's main product |
| `submit` | boolean | no (default `false`) | Also create a draft in Verify & Review for a person to review and approve |
| `title` | string | no | Title of the submitted draft |
| `campaign_id` | string | no | Campaign for the submitted draft (defaults to the first campaign) |

```bash
curl -X POST https://brandora-omega-three.vercel.app/api/v1/check \
  -H "Authorization: Bearer brk_your_key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Try Inkloom AI free for 30 days. Professional is only ₹1,499/month!", "channel": "Social"}'
```

## Response

```json
{
  "verdict": "blocked",
  "summary": "Do not publish: at least one statement contradicts an approved record or lacks approved evidence.",
  "findings": [
    {
      "rule": "F02",
      "outcome": "Verified Contradiction",
      "title": "Check the trial",
      "message": "Approved trial: 14. Applies to Inkloom AI.",
      "suggestion": "14 days",
      "span": "30 days",
      "start": 26,
      "end": 33,
      "evidence": { "source": "Pricing & plans policy", "version": 1, "excerpt": "Inkloom AI plans, effective 1 Nov 2026: …" }
    }
  ],
  "verified": [],
  "checked_against": { "workspace": "Inkloom AI · Judge demo", "subject": "Inkloom AI", "channel": "Social", "policy_revision": 1, "rules": 12, "sources": 8 },
  "ai_used": false,
  "approval": "This API never approves or publishes. Approval is a separate, human step in Brandora."
}
```

| Verdict | When |
|---|---|
| `blocked` | A confirmed contradiction or an evidence gap: the copy conflicts with an approved record or makes a claim with no approved support |
| `needs_review` | Only judgement calls: tone, an unmapped claim, a condition a reviewer must decide |
| `clear` | No issue in the checked rules (a person still approves before publishing) |

With `"submit": true` the response also has a `submitted` object (`content_id`, `title`, `campaign`, `status`). The draft appears in Verify & Review with its findings marked.

## Errors

| Status | Meaning |
|---|---|
| 401 | Missing, unknown or revoked key |
| 422 | Invalid request body |
| 429 | The key reached its rate limit |

## Example: block a publish step in GitHub Actions

```yaml
- name: Check launch copy with Brandora
  run: |
    verdict=$(jq -Rs '{text: ., channel: "Website"}' copy/launch.md \
      | curl -s -X POST "$BRANDORA_URL/api/v1/check" \
          -H "Authorization: Bearer $BRANDORA_KEY" -H "Content-Type: application/json" -d @- \
      | jq -r .verdict)
    echo "Brandora verdict: $verdict"
    test "$verdict" != "blocked"
  env:
    BRANDORA_URL: https://brandora-omega-three.vercel.app
    BRANDORA_KEY: ${{ secrets.BRANDORA_KEY }}
```

Implementation: `api_check` in [`backend/main.py`](../backend/main.py); tests in [`backend/tests/test_round3.py`](../backend/tests/test_round3.py).
