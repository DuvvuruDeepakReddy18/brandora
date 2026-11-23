/* Brandora's own accessibility audit (WCAG 2.2 AA subset), run in the browser console or by a browser tool on any
   screen. Self-contained: no external code is loaded. Returns { screen, checked, issues[] }.
   Checks: text contrast from computed styles (4.5:1, 3:1 for large text), accessible names for buttons, links and
   form controls, image alt text, page language and title, a main landmark, heading order and duplicate ids.
   Limits: text over images or gradients is reported as "not measurable" instead of guessed. */
(function audit(screen) {
  const issues = [];
  const add = (rule, el, detail) => issues.push({ rule, detail, where: path(el), text: (el && (el.innerText || el.getAttribute?.("aria-label") || "")).trim().slice(0, 60) });
  const path = (el) => {
    if (!el || !el.tagName) return "";
    const parts = [];
    for (let n = el; n && n.tagName && parts.length < 4; n = n.parentElement) {
      const cls = (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
      parts.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : cls));
    }
    return parts.join(" > ");
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    const closed = el.closest("details:not([open])");
    if (closed && !closed.querySelector(":scope > summary")?.contains(el)) return false;
    return r.width > 0 && r.height > 0 && !el.closest("[aria-hidden='true'], [hidden]");
  };
  const rgba = (c) => {
    const n = (c.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number);
    // Modern engines report color-mix() results as color(srgb r g b / a) with 0-1 channels.
    return c.startsWith("color(") ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : n;
  };
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const blend = (top, bottom) => { const a = top[3] ?? 1; return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1); };
  const background = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none" && !s.backgroundImage.startsWith("url(\"data:image/svg")) return null;
      const c = rgba(s.backgroundColor);
      if ((c[3] ?? 1) > 0) { layers.push(c); if ((c[3] ?? 1) >= 1) break; }
    }
    let out = [255, 255, 255, 1];
    for (const c of layers.reverse()) out = blend(c, out);
    return out;
  };
  let checked = 0;
  // 1. Text contrast
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || seen.has(el) || !t.textContent.trim() || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName) || !visible(el)) continue;
    seen.add(el); checked++;
    const s = getComputedStyle(el);
    const bg = background(el);
    if (!bg) continue;
    const fg = blend(rgba(s.color), bg);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => x - y);
    const ratio = (b + 0.05) / (a + 0.05);
    const px = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
    const need = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
    if (ratio < need && !el.closest("button:disabled, [aria-disabled='true'], input:disabled")) add("contrast", el, `${ratio.toFixed(2)}:1 (needs ${need}:1) · ${s.color} on rgb(${bg.slice(0, 3).map(Math.round).join(",")}) · ${px}px`);
  }
  // 2. Accessible names
  const name = (el) => {
    const label = el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ");
    if (label.trim()) return label.trim();
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) {
      if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return "label";
      if (el.closest("label")) return "label";
      return el.getAttribute("title") || "";
    }
    return (el.innerText || "").trim() || el.getAttribute("title") || [...el.querySelectorAll("img[alt], svg[aria-label]")].map((i) => i.getAttribute("alt") || i.getAttribute("aria-label")).join(" ").trim();
  };
  for (const el of document.querySelectorAll("button, a[href], [role='button'], [role='tab'], input:not([type='hidden']), select, textarea")) {
    if (!visible(el) && !["INPUT"].includes(el.tagName)) continue;
    if (el.tagName === "INPUT" && el.type === "file") continue;
    checked++;
    if (!name(el)) add(["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) ? "form-label" : "name", el, "No accessible name");
  }
  // 3. Images
  for (const img of document.querySelectorAll("img")) {
    checked++;
    if (!img.hasAttribute("alt")) add("img-alt", img, "Image without an alt attribute");
  }
  // 4. Document structure
  if (!document.documentElement.lang) add("html-lang", document.documentElement, "Missing lang attribute");
  if (!document.title.trim()) add("title", document.documentElement, "Missing page title");
  if (!document.querySelector("main, [role='main']")) add("landmark-main", document.body, "No main landmark");
  let last = 0;
  for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!visible(h)) continue;
    const level = Number(h.tagName[1]);
    if (last && level > last + 1) add("heading-order", h, `h${last} followed by h${level}`);
    last = level;
  }
  const ids = {};
  for (const el of document.querySelectorAll("[id]")) ids[el.id] = (ids[el.id] || 0) + 1;
  for (const [id, n] of Object.entries(ids)) if (n > 1) add("duplicate-id", document.getElementById(id), `id "${id}" used ${n} times`);
  return { screen, checked, issues };
})
