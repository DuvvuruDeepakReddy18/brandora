# Brand Crew product integration

The current product entry is **Brandora — The Brand Crew**, adapted from the approved single-file edition at https://brandora-brand-crew.vercel.app. It supersedes the previous dark hero and V1/V2 experiments as the product landing. The standalone deployment is separate and unchanged.

## Source and fidelity

- Canonical source: `brand-crew/index.html`, SHA-256 `3f8540e6ec92bea2ad51391982d7f9cabce8329c80a6e9762dec1f9c45bb4d53`.
- `node scripts/prepare-brand-crew.cjs` generates `public/brand-crew/index.html`. `--check` verifies exact reproducibility. The canonical file remains unchanged; Git attributes preserve its bytes across Windows/Linux.
- The warm paper, cobalt accent, repaired wordmark, four-robot island, camera flight, ten-case shelf, ink reveal, four reversible asset workflows, feature wipes, local checker, curved carousel and audit export are preserved.
- Three.js remains pinned to 0.170.0 and Lenis to 1.1.13 in the isolated document. This does not use or change the newer Three.js dependency from the earlier uncommitted experiments. Google Fonts and jsDelivr are still external dependencies; the original fallback behavior remains.

## Application boundary

`app/components/brand-crew-landing.tsx` retains the existing landing props and authentication form. The illustration occupies a full-viewport same-origin iframe, retaining its own scroll and CSS. Updating busy/error state does not remount the document. Leaving the landing removes its document and animation runtime; page-hide cleanup additionally disposes WebGL resources. Background rendering pauses while the parent sign-in dialog is open.

Four booking CTAs now open the real isolated judge demo. Log in opens the parent's native auth dialog. The guided visual tour remains available separately. No booking service, contact submission or request-download form is presented as a product feature.

The bridge accepts only `ready`, `login` and `demo`, with exact origin, current-frame source, channel, version and payload checks. The parent returns only demo availability, busy/error status and modal visibility. No password, session token, provider key, account record or workspace content crosses the bridge. All API access remains in the existing app.

Only `/brand-crew/*` permits same-origin framing (`SAMEORIGIN` plus CSP `frame-ancestors 'self'`). The application and API retain their frame denial. This is CSS/runtime separation of trusted code, not a separate security origin.

The landing's checker remains a local rule demonstration; all sample campaign evidence, people, approvals and HUD numbers remain fictional. Scrolling never creates a real approval. Workspace privacy opt-in, source scope, author/reviewer independence, quota limits, partner access, demo isolation and normal session behavior are unchanged.

## Checks and release

Run `node --test scripts/brand-crew.test.mjs`, the generator check, existing API regressions, TypeScript and the production build. CI includes the bridge rejection and source-fidelity checks. Browser verification must cover actual sign-in, demo entry, role changes, exit/reentry, parent modal focus, source/case interactions, scrolling and phone layout.

The shared checkout also contains uncommitted V1/V2 files, package changes and historical design notes. Those are preserved, not reset or included in this release. Deploy from a clean archive of the intended Git commit so Vercel and CI receive the same source/dependency set.

Product target: `brandora` / `prj_2JE7c59uDZ1vljwTac5sp862twx7`, https://brandora-omega-three.vercel.app. Never use the child standalone project's link. See `release.json` and `brand-crew-integration-verification.json` for release identity and observed results.
