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
once('    <script type="module">', '    <script src="/brand-crew/host-bridge.js"></script>\n    <script type="module">');
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
const destination = path.join(root, "public/brand-crew/index.html");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== html) throw new Error("Generated Brand Crew entry is stale. Run node scripts/prepare-brand-crew.cjs.");
  console.log("Brand Crew generated entry matches the approved source and integration transforms.");
} else {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
  console.log("Prepared public/brand-crew/index.html from canonical source " + expected.slice(0, 12));
}
