# Brandora landing page

## Direction

A dark editorial introduction to Brandora's evidence-to-approval workflow. Deep ink, muted teal, warm paper, and mint preserve the existing identity. Newsreader (including its real italic face) pairs with DM Sans. The authenticated application retains its existing layout.

The user requested UI/UX Pro Max and suggested 21st.dev, GSAP, Taste Skill, and Three UI. **21st.dev is the chosen reference**, specifically its [3D tilt and glow card pattern](https://21st.dev/@themeocean/components/3d-animated-tilt-dynamic-glow-card). The implementation is original; no third-party component source or assets were copied. [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) was installed from its official repository and used for design-system, reduced-motion, accessibility, and Next.js guidance. Its general B2B palette/typography recommendations were adapted to Brandora's existing brand.

## Interaction

- Perspective-transformed source, draft, and approval layers respond to pointer position through Motion springs. Source / Review / Approve buttons provide the same storytelling on touch and keyboard.
- Only transforms and opacity drive continuous/reveal motion. There is no WebGL context, external video, runtime asset download, or scroll hijacking. Native anchor scrolling is smooth when motion is enabled.
- Reduced-motion preferences disable decorative animation and pointer tilt. An explicit pause control is available. The hero pauses offscreen, and page visibility/sign-in suspend decorative motion.
- Feature tabs demonstrate AI review, OCR/logo checks, and translation. Previews are labeled illustrations, not live analysis or claimed evaluation results.
- Explore demo calls the existing isolated-demo endpoint. Sign in opens a native modal dialog with Escape, focus containment, and focus restoration. Setup visibility and owner authentication remain controlled by the existing application logic.

## Verification

- TypeScript and optimized Next.js production build passed.
- Browser checks at 375, 768, 1024, and 1440 CSS pixels: no horizontal document overflow; phone/tablet layouts stack the hero and adapt content.
- Stage buttons update the displayed explanation and 3D depth; pointer input updates the spring transforms. Pause removes continuous animation and tilt.
- Feature selection works by click and arrow keys. Native sign-in dialog closes with Escape and restores focus to its trigger.
- The bottom demo CTA opens the existing isolated workspace at the top of its overview. Owner data is not involved in this check.
- System reduced-motion behavior is implemented with Motion's preference hook and CSS media guards; no operating-system preference was changed during verification.

See `release.json` for the deployed source revision and release checks. Browser images document the shipped layout. No frame-rate benchmark, user study, or conversion result is claimed.
