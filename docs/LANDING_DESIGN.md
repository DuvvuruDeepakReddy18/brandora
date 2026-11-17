# Current landing: Brandora — The Brand Crew

The product uses the warm-paper/cobalt Brand Crew landing, with the four robots, scroll-driven scenes, case inspection and illustrative audit trail. Real login and isolated judge-demo entry are connected through the host app. Both entry buttons remain visible down to 320px; the sign-in dialog works on small phones. See [BRAND_CREW_INTEGRATION.md](BRAND_CREW_INTEGRATION.md) for the implementation boundary and release verification.

Earlier V1/V2 source, assets and standalone deployment records are retained in this repository as design history. They are not imported by the current product entry.

## Archived landing: Case Library v2

Published 2026-11-16 at https://brandora-hero-v2.vercel.app. This earlier case-library edition and the v1 source and public deployment are preserved below for comparison.

User references: Leon Vasari physical shelf, VirtualFit scan reveal, Krung Travel cinematic feature compositions, Reelmark horizontal browsing, and MotionSites Moss Island / Fox Couture / Robot Jellyfish. Original Brandora case artwork and optical robot were built in code; reference brand artwork was not reused.

- Six CSS 3D cases: claim accuracy, tone, visual consistency, translation, human review and version history. Drag, swipe, arrows and keyboard select a case.
- One continuous scroll stage pulls the case forward, presents its approved source, reveals the correction with a clipped scan, then opens explicit approval and history controls.
- Dynamically loaded Three.js optical inspector with articulated probe and legs follows the scan. HTML fallback remains when WebGL is unavailable.
- Horizontal feature scenes pair large type with physical source, brand and review objects. Buttons and phone swipes change scenes.
- Native vertical scrolling, damped transforms, capped renderer resolution, reduced-motion support, pause control, skip link and inert inactive copy.
- Local full-app entry preserves existing workspace callbacks. The separate public export uses the `standalone` prop, provides an on-page replay and includes no backend or authentication.

Implementation: app/components/case-landing.tsx, case-landing.css, case-inspector.ts. Package with node scripts/prepare-hero-v2.cjs into .local/brandora-hero-v2.

Validation: TypeScript and Vercel production build passed. Desktop and 390px phone layouts inspected; scan, case selection, approval, change requests and feature navigation checked. No real-device frame-rate benchmark or live AI provider call is implied by the illustrative landing.

---

# Brandora robot studio landing

## Direction

An original, warm 3D studio replaces the previous dark card-based landing page. Three porcelain robots work on one fictional FORMA campaign. DM Sans and Newsreader, paper tones, muted green and a physical desk keep the presentation aligned with Brandora.

The user approved the collaborative-robot concept and requested continuous scroll animation without abrupt scene changes. No template source, stock robot model, remote video or generated concept image is shipped. The robots, materials, geometry and campaign artwork are built in code.

## Story and interaction

1. Meet the evidence, brand and language specialists.
2. Connect the draft's 50% claim to an approved source supporting 30% by weight versus the previous bottle.
3. Blend the correction and brand palette into the same campaign.
4. Compare English and French while preserving the number and qualification.
5. Hand version 3 to a human. Approve sample / Request changes update an illustrative receipt only after an explicit click.
6. Keep draft, suggested changes and human decision connected in the version trail.

The illustration does not run AI or write workspace approvals. Existing Explore demo and sign-in handlers remain connected to the real app.

## Implementation

- `app/components/studio-landing.tsx`: native scrolling, chapter controls, approval illustration, auth dialog and editorial sections.
- `app/components/studio-landing.css`: desktop, tablet and phone compositions.
- `app/components/studio-scene.ts`: dynamically loaded Three.js world. A single renderer/camera/scene stays mounted; damped scroll progress drives continuous poses and canvas-texture changes.
- DPR is capped at 1.7. Rendering pauses offscreen or when the document is hidden; reduced motion freezes decorative movement and skips unchanged renders. GPU resources are disposed on unmount.
- A static illustration remains available during loading or when WebGL is unavailable. Essential story and controls are regular HTML, with inactive chapters inert.
- Native dialog supports Escape and focus restoration. Skip-animation and reduce-motion controls are available.

## Verification — 2026-11-16

- TypeScript validation and optimized Next.js build passed; `git diff --check` passed.
- Desktop and phone layouts inspected. Phone widths 360 and 390, plus portrait tablet 820, were checked; compact review spacing and tablet stacking were refined.
- Chapter navigation, evidence/correction/translation story, pending review, approve, request changes and reset were exercised. Scrolling does not approve content.
- Reduce-motion control and chapter navigation work together. OS reduced-motion support is implemented but the user's OS preference was not changed for testing.
- Sign-in opens the existing form; Escape closes it and restores focus to Sign in.
- Explore demo opened an isolated fictional HarborDesk workspace; Leave demo returned to the landing page.
- No backend logic changed. No new backend test suite or real-device frame-rate benchmark was run.

## Preview and release

Local optimized preview: http://127.0.0.1:3200. The full workspace remains local; the standalone hero release is listed below.

This checkout's `.env.production.local` includes Vercel settings. For a local production build, the ignored `.local/build-studio-preview.cjs` helper blanks VERCEL and sets BRANDORA_API_URL to http://127.0.0.1:8200 before invoking Next's build. This preserves the local API rewrite. Use the standard build for deployment.

Screenshots: `robot-studio-desktop.jpg`, `robot-studio-mobile.jpg`, `robot-studio-review.jpg`.

## Standalone hero release

Published on 2026-11-16 as https://brandora-hero-v1.vercel.app (project brandora-hero-v1). This is the public interactive landing page, with Explore workflow starting the on-page campaign. Backend and sign-in are excluded from this separate project. Reproduce the source with node scripts/prepare-hero-v1.cjs; deployment files are in .local/brandora-hero-v1. See hero-v1-release.json for deployment identity and source checksums.
