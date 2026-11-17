# Brand Crew workspace — 17 November 2026

The dashboard and every internal view now share the landing page's warm paper, black ink and cobalt design. Archivo, Newsreader and JetBrains Mono are self-hosted. The dashboard reuses the exact four robot portraits from the Brand Crew illustration and provides working CITE, LENS, LINGO and RELAY shortcuts. Workspace totals still come from the API.

`app/workspace-theme.css` supplies shared navigation, controls, forms, tables, evidence panels, tool surfaces, dialogs and responsive styling. Existing workflow components and API contracts are preserved. Subtle entrance and hover motion respects reduced-motion preferences; internal workflows do not load another 3D scene. The judge walkthrough is expandable, while role switching and demo exit remain immediately available.

Finding badges distinguish contradictions and unverified evidence in amber from approvals in green. This also fixes the previous `Verified` substring match that coloured `Unverified` findings green.

## Local verification

- All 14 views checked at desktop, 768, 390 and 320-pixel viewport widths; no document-level horizontal overflow observed. Tables retain their own scrolling where needed.
- All four crew shortcuts opened their corresponding internal tool.
- Successful password login to a disposable local account; separate demo entry and exit restored the original empty workspace.
- Anonymous demo entry and exit; creator, reviewer, manager and partner switching.
- Corrected the launch draft, saved/scanned version 2 with zero findings, requested review and approved as a separate reviewer. The approval receipt showed the exact version and SHA-256 hash and downloaded successfully.
- Receipt dialog closed with Escape and restored focus. Draft creation succeeded through the 320-pixel dialog, which scrolls vertically without horizontal clipping.
- A hypothetical price change affected three items while existing approvals stayed approved. The projection disclaimer remained visible.
- Cobalt text on paper returned 6.15:1 from the real contrast endpoint, with missing alt text still called out separately.
- Translation language controls, approved logo references, OCR controls, settings, source and history views were inspected. Existing provider checks are retained; this styling pass did not make new external AI calls.
- No warning or error entries were recorded in the local browser console.

Automated and production release results are recorded in `workspace-theme-verification.json` after deployment. Earlier full AI/provider verification remains in `VERIFICATION.md` and `docs/cloud-verification.json`.
