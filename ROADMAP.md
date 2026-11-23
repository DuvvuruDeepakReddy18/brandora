# Known limitations and roadmap

## Known limitations (honest, as of 23 Nov 2026)

**Detection**
- **Held-out evaluation:** 96.2% precision and 86.2% recall on synthetic, team-labelled content. The known misses are plan aliases ("Pro"), durations written in words ("a month"), unlisted capitalisation of product names, and paraphrased mapped claims ("80 percent"). "Best regards" is flagged as a superlative for review.
- **AI reading:** OCR can misread text. Text positions on images are estimated within each OCR line. Logo comparison is visual similarity, not proof of authenticity.
- **Colour check:** dominant colours are compared with the approved palette. Photography and illustrations can legitimately use other colours, so the result is a judgement call, never a verdict.
- **Accessibility checks** cover contrast, text size and alt text. They do not cover reading order, captions for video, or tagged-PDF structure. PDF figures have no alt text to check unless the PDF is tagged.

**Formats**
- **Supported:** text, PNG/JPEG/WebP, PDF (text layer, or scanned pages with AI OCR up to 5 pages), PowerPoint (.pptx), DOCX, TXT and Markdown.
- **Not yet supported:** video, audio, HTML pages and Figma.
- **Deck previews** are drawn by Brandora from the file: fonts and effects are approximated, while colours, sizes and positions come from the file.

**Workflow**
- No email or chat notifications.
- No automatic publishing (by design; approval never publishes).
- Account recovery is administrator-operated.
- Brandora does not know who saw published content, so reassessment flags previously approved items as high priority rather than estimating exposure.

**Assurance**
- Functional verification, a labelled evaluation, a live claim check and an automated accessibility audit only.
- No penetration test, load test, manual screen-reader pass or formal user study yet.

## Roadmap

### Next 4 weeks (pilot readiness)
1. **Close the measured misses:** plan aliases and word-number durations in the rule engine, then grow the held-out set with real (consented, anonymised) pilot content and report it separately.
2. **Notifications:** email or Slack when a review is requested, approved or needs reassessment.
3. **Single sign-on** (Google Workspace, Microsoft Entra) and SCIM provisioning for real organisations.
4. **Manual accessibility pass** with NVDA and VoiceOver on the review workspace; fix what it finds.

### Next 3 months (integrations)
1. **CMS connectors** built on the check-before-publish API: WordPress, Contentful and Webflow plugins that block publishing on a `blocked` verdict.
2. **Figma plugin:** check frames against the palette, logo and copy rules before export.
3. **HTML and landing-page checks:** crawl a staging URL and mark findings on screenshots of each page.
4. **Rule suggestions from imports:** propose rules from an imported brand guideline for a manager to approve (never applied automatically).

### Next 6–12 months (scale)
1. **Video and audio:** transcript and frame checks for ads and reels.
2. **Multi-brand workspaces** with shared and brand-specific rules.
3. **Data residency** options and a customer-managed key for stored creatives.
4. **Third-party security review** and load testing before general availability.

Each item keeps the same principles: approved sources first, AI only as cited suggestions, and a person approves.
