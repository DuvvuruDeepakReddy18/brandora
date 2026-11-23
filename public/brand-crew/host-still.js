/* No-WebGL fallback for the landing. When the 3D scene cannot start, show a still
   image of that same scene in its place and tell the visitor how to see the
   interactive original. Nothing is loaded or shown while the 3D scene works. */
(() => {
  "use strict";
  const fallback = document.querySelector(".world-fallback");
  const canvas = document.querySelector("#world-canvas");
  const section = document.getElementById("world");
  if (!fallback || !canvas || !section) return;
  let active = false;
  let ticking = false;
  let still = null;
  const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

  // Dim the still while the page's own headlines are over it, as the 3D scene does.
  function update() {
    ticking = false;
    const rect = section.getBoundingClientRect();
    const w = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - innerHeight)));
    const vision = smooth((w - 0.2) / 0.06) * (1 - smooth((w - 0.355) / 0.045));
    const final = smooth((w - 0.81) / 0.06) * (1 - smooth((w - 0.94) / 0.06));
    still.style.opacity = String(1 - 0.85 * Math.max(vision, final));
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  function reloadPage() {
    try { window.top.location.reload(); } catch { window.location.reload(); }
  }

  function activate() {
    if (active || fallback.hidden) return;
    active = true;
    document.documentElement.dataset.worldStill = "true";

    still = document.createElement("picture");
    still.className = "host-world-still";
    still.setAttribute("aria-hidden", "true");
    still.innerHTML =
      '<source media="(max-width: 820px)" srcset="/brand-crew/world-still-mobile.webp" type="image/webp">' +
      '<img src="/brand-crew/world-still.webp" alt="" decoding="async">';
    canvas.after(still);

    const note = document.createElement("div");
    note.className = "host-3d-note";
    note.setAttribute("role", "status");
    note.innerHTML =
      '<p><b>You are seeing a still image of this page.</b> ' +
      '<span class="host-3d-long">3D graphics (WebGL) are turned off in this browser, so the interactive scene could not start. ' +
      'To see the original, turn on hardware acceleration (Chrome or Edge: Settings → System → “Use graphics acceleration when available”), restart the browser and open this page again.</span>' +
      '<span class="host-3d-short">3D graphics are off in this browser. To see the original, turn on graphics acceleration in browser settings, restart and reload.</span></p>' +
      '<div class="host-3d-actions"><button type="button" class="host-3d-reload">Reload</button>' +
      '<button type="button" class="host-3d-close" aria-label="Hide this message">Hide</button></div>';
    note.querySelector(".host-3d-reload").addEventListener("click", reloadPage);
    note.querySelector(".host-3d-close").addEventListener("click", () => note.remove());
    document.body.append(note);

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    update();
  }

  new MutationObserver(activate).observe(fallback, { attributes: true, attributeFilter: ["hidden"] });
  activate();
})();
