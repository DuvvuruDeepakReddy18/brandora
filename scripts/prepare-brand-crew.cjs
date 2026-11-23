/* Reproducibly adapt the approved single-file design; leave the source intact. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "brand-crew/index.html"));
const expected = "3f8540e6ec92bea2ad51391982d7f9cabce8329c80a6e9762dec1f9c45bb4d53";
if (crypto.createHash("sha256").update(source).digest("hex") !== expected) throw new Error("Canonical Brand Crew source changed. Review it before updating this source pin.");
let html = source.toString("utf8");
function once(from, to) {
  if (html.split(from).length !== 2) throw new Error("Integration anchor is not unique: " + from.slice(0, 80));
  html = html.replace(from, to);
}
if ((html.match(/Book a demo <svg>/g) || []).length !== 4) throw new Error("Expected four demo entry points.");
html = html.replaceAll("Book a demo <svg>", "Explore demo <svg>");
once("  </head>", '    <link rel="stylesheet" href="/brand-crew/host.css" />\n    <meta name="brandora-edition" content="Brand Crew — integrated product entry" />\n  </head>');
once('    <script type="module">', '    <script src="/brand-crew/host-bridge.js"></script>\n    <script src="/brand-crew/host-still.js"></script>\n    <script type="module">');
// The real product has no booking service. Keep the guided tour, replace the
// request-download flow, and leave the complete visual narrative untouched.
const start = html.indexOf("      function openDemo() {");
const end = html.indexOf('      $$("[data-info]").forEach', start);
if (start < 0 || end < 0) throw new Error("Demo handler anchors missing.");
html = html.slice(0, start) + '      function openDemo() { window.BrandoraHost.request("demo"); }\n' + html.slice(end);
once("      function openInfo(key) {", '      function openInfo(key) {\n        if (key === "login") { window.BrandoraHost.request("login"); return; }');
once("This concept preview does not publish pricing or accept payments. Explore the workflow, then prepare a demo request with your team size and review needs.", "No paid plans or checkout are offered here. Choose Explore demo to evaluate Brandora in your own temporary sample workspace, or log in to your existing workspace.");
once("The standalone Brand Crew preview is separate from the Brandora application. Workspace authentication is not connected on this page. You can explore every sample workflow without signing in.", "Log in to your existing Brandora workspace, or choose Explore demo for a separate temporary workspace without credentials.");
once("Start with the guided walkthrough, or prepare a demo-request file to share with the team building your workspace. No request is sent automatically from this preview.", "Watch the crew work for a guided visual introduction, or choose Explore demo to try the real application. This page does not book meetings or send contact requests.");
once("The claim checker on this standalone page runs locally in your browser. It does not upload your input or call an AI service. All campaigns, reviewer identities and performance figures shown here are fictional examples.", "The illustrative claim checker on this page runs locally and does not send your text to AI. The real workspace has separate accounts, scoped evidence, human approval and opt-in AI. The campaigns, reviewers, approvals and performance figures in this introduction are fictional examples.");
once("      function frame(ms) {", '      function frame(ms) {\n        if (document.documentElement.dataset.hostModal === "true") {\n          last = ms;\n          rafId = requestAnimationFrame(frame);\n          return;\n        }');
once("          s?.renderer.dispose();", "          s?.scene.traverse((object) => {\n            object.geometry?.dispose();\n            const materials = Array.isArray(object.material) ? object.material : [object.material];\n            for (const material of materials) {\n              if (!material) continue;\n              for (const value of Object.values(material)) if (value?.isTexture) value.dispose();\n              material.dispose();\n            }\n          });\n          s?.renderer.dispose();\n          s?.renderer.forceContextLoss();");
// "Watch the crew work" becomes a full guided tour: one click glides through the whole
// story to the final call to action, and any scroll, click or key press hands control back.
once('id="watch-crew"', 'id="watch-crew" title="Auto-plays the whole story. Scroll, click or press any key to stop."');
once('$("#watch-crew").onclick = () => goTo("world", 0.27, 1.8);', `let touring = false, tourPill = null;
      const tourStops = ["wheel", "touchstart", "pointerdown", "keydown"];
      function stopTour(finished = false) {
        if (!touring) return;
        touring = false;
        tourStops.forEach((type) => window.removeEventListener(type, interruptTour, true));
        if (lenis && !finished) { lenis.stop(); lenis.start(); }
        tourPill?.remove();
        tourPill = null;
        if (finished) {
          // Layout uses viewport units; realign if the window changed size during the tour.
          const top = sectionEls.contact.getBoundingClientRect().top + scrollY;
          if (lenis && Math.abs(top - scrollY) > 40) lenis.scrollTo(top, { duration: 1.2 });
          const cta = $("#contact [data-demo]");
          cta?.classList.add("tour-arrived");
          setTimeout(() => cta?.classList.remove("tour-arrived"), 6000);
        }
      }
      function interruptTour() { stopTour(false); }
      function startTour() {
        const target = sectionEls.contact;
        if (!target) return goTo("world", 0.27, 1.8);
        const end = target.getBoundingClientRect().top + scrollY;
        if (!lenis || reduce) return goTo(target);
        lenis.resize?.();
        touring = true;
        tourPill = document.createElement("div");
        tourPill.className = "crew-tour-pill";
        tourPill.setAttribute("role", "status");
        tourPill.textContent = "Guided tour playing · scroll, click or press any key to stop";
        document.body.append(tourPill);
        const distance = Math.max(0, end - scrollY);
        const duration = Math.min(95, Math.max(8, distance / (H * 0.42)));
        lenis.scrollTo(end, {
          duration,
          lock: false,
          easing: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
          onComplete: () => stopTour(true),
        });
        // Listeners attach after this click finishes, so the starting click does not stop the tour.
        setTimeout(() => tourStops.forEach((type) => window.addEventListener(type, interruptTour, { capture: true, passive: true })), 0);
      }
      $("#watch-crew").onclick = () => startTour();
      if (new URLSearchParams(location.search).get("tour") === "1") {
        // Linked tours start from the top once the intro has played and the layout is measured.
        if ("scrollRestoration" in history) history.scrollRestoration = "manual";
        const begin = performance.now();
        const ready = () => {
          const settled = lenis && performance.now() - begin > 3800 && document.documentElement.scrollHeight > innerHeight * 4;
          if (settled || performance.now() - begin > 15000) {
            lenis?.resize?.();
            if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
            else window.scrollTo(0, 0);
            setTimeout(startTour, 200);
          } else setTimeout(ready, 250);
        };
        ready();
      }`);
const destination = path.join(root, "public/brand-crew/index.html");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== html) throw new Error("Generated Brand Crew entry is stale. Run node scripts/prepare-brand-crew.cjs.");
  console.log("Brand Crew generated entry matches the approved source and integration transforms.");
} else {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
  console.log("Prepared public/brand-crew/index.html from canonical source " + expected.slice(0, 12));
}
