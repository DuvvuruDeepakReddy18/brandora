# Evaluating Brandora

Open https://brandora-omega-three.vercel.app.

**First, about one minute:** press **Watch the crew work** under the headline. The landing page plays itself through the whole product story and stops on **Explore demo**. Scroll, click or press a key to take over. Auto-playing link: https://brandora-omega-three.vercel.app/brand-crew/index.html?tour=1

**Then** choose **Explore demo**. No email, password, setup code or API key is needed. Live AI is on by default. If you are already signed in, use **Explore a separate demo**. Inside the app, **Watch the product story** in the demo bar replays the landing page in a new tab.

Every browser gets its own temporary copy of **Inkloom AI**, a fictional B2B creative-workflow SaaS company. The demo opens directly on an employee-submitted advertisement with six problems marked on it.

## New in Round 3 (each opens from **More to explore** in the demo bar or the cards on Home)

All three run on the rule engine with no AI, so they work even if the AI provider is busy.

1. **Measured, trustworthy findings + tone & messaging.** Open **Trust & Audit → Reliability**. Brandora runs an 80-item labelled set of fictional Inkloom AI content (40 development, 40 held-out, 22 clean controls) through the same engine that checks your content, and shows precision, recall and citation validity. Held-out results are reported as they came out: **96.2% precision, 86.2% recall, 50/50 valid citations, 1 false alarm in 22 clean controls**. The five failures are listed with the reason each one happens. CI re-runs the evaluation on every push and fails if the scores drop or the published report (`docs/reliability.json`) is out of date. The new **Tone & messaging** findings (violet) cite the approved **Brand voice guide**: hype and pressure words, off-message promises (“instant results”, “risk-free”), preferred terms, too many exclamation marks, capitals in emails and social posts, and sentences over 30 words. A reviewer can accept tone wording in context with a reason.
2. **Every format, page by page, with accessibility.** Open **10-page brochure, page by page** (a PDF) or **Sales deck: tone & accessibility** (a PowerPoint file). Use the page arrows, the thumbnails (each shows how many findings are on that page) and zoom. Click any finding to jump to its page. **Accessibility** findings (teal) are measured: contrast of real text against its background with the ratio and the WCAG 4.5:1 or 3:1 minimum (the brochure cover tagline is 2.02:1, the white-on-orange callout on page 6 is 1.76:1, the deck subtitle is 2.32:1), 6 pt and 7 pt small print, and a missing and an unhelpful (“image1.png”) alt text on slide 4. On the ad, the alt text box under the image is part of the reviewed version: try changing it to “banner” and the check flags it. Documents are revised by uploading the corrected file: in **Fix & approve** download **the corrected sample brochure** and upload it. It comes back as version 2 with no findings.
3. **From repeated mistakes to clearer guidelines.** Open **Company Hub → Guideline insights** as the Reviewer. It reads eight weeks of recorded findings and reviewer decisions (fictional history, labelled as such, produced by running the real engine on fictional drafts): recurring mistakes by rule, channel, campaign and team (internal team vs partner agencies, never individuals). It flags **P02 Professional plan price** as possibly unclear, because reviewers overrode 9 of 14 GST-note decisions, all on Email. Choose **Draft this clarification** (limit the GST note to other channels), then **Replay on history**: agreement with recorded reviewer decisions goes from 35.7% to 100%, with 0 confirmed issues missed. Switch to Manager, add a note and **Approve and apply**. A manager cannot approve their own proposal. The change is written to the audit trail with the proposer, approver and replay result, and content that relied on the rule is flagged for re-checking. Creators see the most common confirmed mistakes as tips in **Scan & Detect**.

## The sample company's approved records (Company Hub)

- Starter ₹999/month · Professional ₹1,999/month · Enterprise custom pricing · prices exclude GST · free trial 14 days
- Approved claims: helps marketing teams organise creative workflows; a central workspace for campaign content; supports collaborative content review
- No approved evidence for "the world's No. 1 creative platform" or "reduce marketing production time by 80%"
- Approved logo: violet ink-drop mark with the dark "Inkloom AI" wordmark
- Brand voice guide: no hype or pressure words, no “instant results” or “risk-free”, at most one exclamation mark, no capitals in emails and social posts, sentences under 30 words
- Accessibility standard (WCAG 2.2 AA edition): contrast at least 4.5:1 (3:1 for large text), body text at least 9 pt, helpful alt text on every image

## Walkthrough (about five minutes)

The demo bar at the top switches between four teammates: creator, reviewer, manager and partner. Permissions are enforced by the API for each role.

1. **See the marks (Creator).** The ad shows six numbered marks: wrong logo (red, dashed), two evidence gaps (orange), wrong trial length and wrong price (red), and a GST note to review (yellow). Click a mark or a card to see the submitted content next to the approved record, the exact source excerpt and version, the confidence and the next step. Use the filters (Critical, Evidence gaps, Needs review, Visual) and **Hide annotations**. **Download report** saves an annotated HTML review.
2. **Decide (Reviewer).** Confirm the price finding with a reason. Mark the GST note as verified, or reject it with a reason. Request evidence for the 80% claim, which creates an owned task in Verify & Review. Try to reject a confirmed contradiction: it is refused, because it comes from an approved record.
3. **Fix and approve (Creator, then Reviewer).** In **Fix & approve**, choose **Apply all suggestions**. The suggestions use approved values and approved-claim rewrites. Then **Save corrected version & re-check**: version 2 comes back clean, with green verified values. Choose **Request review**, switch to Reviewer and **Approve this exact version**. A receipt with a SHA-256 hash is issued. **Original vs corrected** shows version 1 with its marks next to the approved version 2.
4. **Change a fact (Manager).** Open **Impact Monitor**, choose *Free trial*, enter 7, preview the impact, then publish. A new source version is created, the old one is kept, and every linked item is flagged for reassessment, with previously approved items marked High priority. Open a flagged item and choose **Re-check now** to see the new contradiction.
5. **Live AI (on by default).** Click **Re-read with live AI** on the sample ad, or use the wrong or corrected ad image in **Scan & Detect**, or upload any creative. Those findings come from real OCR and logo comparison. If the provider fails, the screen says so and nothing is saved; if a daily limit is reached, rule checks still run and the result is marked *AI incomplete* with **Retry check**. A manager can turn AI off in **Trust & Audit → Privacy & AI**.
6. **Partner scope (Partner).** The partner sees only the assigned campaign. Internal content is hidden by the API.
7. **Scan your own or sample content (Creator).** In **Scan & Detect**, press **Use this sample** on the 10-page brochure, the sales deck, the short brochure PDF or the social caption. Both work without AI, and each card says what should be found. With AI on, try the wrong or corrected ad images. You can also download any sample from the demo bar and drag it in.

The demo bar shows what the current person can and cannot do, ticks off each walkthrough step, and offers **Next**. **More to explore** jumps to every other feature: Company Hub records, importing a sample policy document, resolving the Asset Vault source conflict, claim lineage, logos and colour checks, team and roles, the audit trail, the review report and translation. Wherever a role cannot do something, the screen explains why and offers a one-click switch to the right person.

**Reset** starts a fresh demo. **Leave** returns to the sign-in page, or to your own workspace if you were signed in.

## What is real and what is sample data

- Text findings in the sample ad are produced by the live rule engine against the Company Hub records above.
- The text positions on the sample image and its logo finding are predefined sample data. They are labelled **DEMO SAMPLE** in the interface. **Re-read with live AI** replaces them with real OCR output as a new version.
- Everything you upload or paste is analysed dynamically. Nothing is hardcoded to Inkloom AI.

## Demo limits

- Sessions expire after two hours, and each visitor's data is isolated.
- Each demo session has 30 AI requests per UTC day and 250 write actions. All demos share a daily AI cap. Session creation is rate-limited per client.
- Use fictional data. Live AI is on by default in demos, so uploaded images and checked text are sent to the configured provider (Gemini) when you scan. A manager can turn it off.
