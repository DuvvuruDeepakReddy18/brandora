# Brandora — The Brand Crew

Live: https://brandora-brand-crew.vercel.app

The complete landing page is `index.html`: plain HTML, inline CSS and one ES module. No build or package installation is needed. Serve this directory over HTTP; opening a local `file:` URL may block module loading.

## Experience

- A procedural paper island, camera flight and four ceramic robots from one shared Three.js factory. Portraits are renders of those same models.
- Thirty physical case boxes representing ten distinct mistakes, with category navigation, dragging, keyboard controls and expanding before/after proofs.
- Four campaign assets go through scanning, issue flags, three reversible corrections and an illustrative human approval.
- Four cinematic feature scenes with masked wipes, a local claim-check example, a curved asset carousel, and a seven-event audit record that can be printed or saved as PDF.
- Mobile layouts, motion pause controls, reduced-motion behavior, keyboard navigation and native modal focus management.

Scroll controls the workflow and camera. Ambient walking, blinking, clouds, slider advancement and carousel drift run on elapsed time. Offscreen sections stop rendering; rendering resolution adapts to slower devices.

## Dependencies and customization

The only network dependencies are Google Fonts, Three.js 0.170.0 and Lenis 1.1.13 from jsDelivr. All artwork and models are generated in the page. If WebGL or a CDN is unavailable, the paper interactions and SVG robot portraits remain available.

Edit `CREW`, `CASES`, `STATION_ASSETS`, `FEATURES`, `CHANNELS` and `AUDIT` in the inline module to change the story. `ASSETS` optionally accepts four sky images, a cloud image and two scroll-scrubbed videos. Media URLs must permit cross-origin loading; unavailable video frames fall back to the procedural scene. No optional media is included in this release.

## Scope

Sorrel & Sage, its evidence, reviewers, approval events and dashboard numbers are fictional demonstrations. The local claim checker uses simple rules and does not call an AI service or validate a real claim. Only the matching sample claim can attach the fictional source. Demo requests download locally and are not sent or booked. This standalone landing page does not alter the separate Brandora product application or its database.

The canonical editable source is this directory's `index.html`. Vercel serves it as a static site. The separate project is `brandora-brand-crew`.
