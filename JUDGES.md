# Evaluate Brandora

Open https://brandora-omega-three.vercel.app and choose **Explore demo**. No email, password, setup code or API key is required. If you are already signed in, use **Explore a separate demo**.

Every browser gets its own temporary HarborDesk workspace. Fictional sources, six rules, five drafts, a source conflict, an evidence gap, a historical approval receipt and an approved logo are included. The demo starts with deterministic checking; live Gemini tools are available after you enable AI.

## Suggested walkthrough

1. **Creator:** open **Launch announcement**. Replace the message with: `Meet HarborDesk. Try it free for 14 days. Plans start at INR 499/month, billed annually.` Choose **Save & check**, then **Request review**.
2. **Reviewer:** switch using the demo controls. Open the draft in **Review desk**, inspect its evidence and approve the exact version. The creator cannot approve their own draft. **Time machine** shows the resulting receipt.
3. **Manager:** inspect **Rulebook & sources**, **Source conflicts**, **Claim DNA** and **Impact lab**. A source change invalidates connected approvals; hypothetical replay does not change live records. Partner workspace permits member and campaign-assignment experiments inside this demo only.
4. **Partner:** inspect the assigned campaign. The internal brand-strategy campaign is hidden by API authorization.
5. **AI:** choose **Set up live AI** in the walkthrough, then enable it in **Privacy & settings**. Translate a saved draft in **Content studio**; the result saves separately and requires language review by another role. Download the creative and scanned PDF from the walkthrough. In **Visual checks**, select the preloaded approved logo and upload the creative for OCR/logo comparison. Import the scanned PDF through the source OCR workflow as manager. All outputs are actual provider responses and need human review.

**Reset samples** starts a fresh demo. **Leave demo** returns to your existing signed-in workspace, or to the sign-in page for an anonymous visitor. Switching roles is an evaluation simulation of separate teammates; normal workspaces retain separate credentials.

## Demo boundaries

- Sessions expire after two hours. Expired demo data is removed in bounded batches when new demos are opened; expiry blocks access immediately. Resets remove the requesting demo's data immediately.
- Each demo has 12 AI requests per UTC day and 250 write actions. All demos share an 80-request daily AI cap, within the application's existing global cap. Session creation is capped at 12 per client address per hour and 200 per day across the app. Provider quota or availability can also limit calls. No result is fabricated when a provider fails.
- Use fictional data. AI sends selected material to the configured provider only after it is enabled and invoked. Demo account emails are converted into internal fictional addresses; demo credentials cannot log into the normal application.
- The owner's accounts, content, provider settings and session cookie are not copied into demo workspaces. Only server-side provider configuration is shared; demo limits apply separately.
- `BRANDORA_EXPLORE_DEMO=0` disables new and existing demo access without changing normal authentication. The legacy development-only demo login remains disabled in production.
