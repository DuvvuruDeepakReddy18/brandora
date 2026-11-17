/* Public UI bridge only: no authentication, provider calls, or workspace data. */
(() => {
  "use strict";
  const channel = "brandora.brand-crew";
  const embedded = window.parent !== window;
  let state = { demoAvailable: true, busy: false, error: "", authOpen: false };
  let receivedState = false;
  let pending = false;
  let returnTo = null;
  const status = document.createElement("div");
  status.className = "brand-crew-host-status";
  status.setAttribute("role", "alert");
  status.hidden = true;
  document.body.append(status);

  function post(type) {
    window.parent.postMessage({ channel, version: 1, type }, window.location.origin);
  }
  function render() {
    document.querySelectorAll("[data-demo]").forEach((button) => {
      button.disabled = state.busy || pending;
      button.setAttribute("aria-busy", String(state.busy || pending));
      const label = state.busy || pending ? "Opening…" : !embedded ? "Open Brandora" : state.demoAvailable ? "Explore demo" : "Open workspace";
      // Keep the original SVG and styling; change only its text node.
      const text = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (text) text.textContent = label + " ";
    });
    document.querySelectorAll('[data-info="login"]').forEach((button) => { button.disabled = state.busy || pending; });
    status.hidden = !state.error || state.authOpen;
    status.textContent = state.error;
    document.documentElement.dataset.hostModal = String(state.authOpen);
  }
  function request(type) {
    if (type !== "login" && type !== "demo") return;
    if (!embedded) { window.location.assign("/"); return; }
    if (state.busy || pending || state.authOpen) return;
    returnTo = document.activeElement;
    pending = true;
    render();
    post(type);
  }
  window.BrandoraHost = Object.freeze({ request });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest('[data-demo], [data-info="login"]');
    if (!control) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    request(control.hasAttribute("data-demo") ? "demo" : "login");
  }, true);
  window.addEventListener("message", (event) => {
    if (!embedded || event.source !== window.parent || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.channel !== channel || data.version !== 1 || data.type !== "ui-state" ||
      typeof data.demoAvailable !== "boolean" || typeof data.busy !== "boolean" ||
      typeof data.authOpen !== "boolean" || typeof data.error !== "string") return;
    const wasOpen = state.authOpen;
    state = { demoAvailable: data.demoAvailable, busy: data.busy, error: data.error, authOpen: data.authOpen };
    pending = false;
    render();
    if (wasOpen && !state.authOpen && returnTo instanceof HTMLElement) returnTo.focus({ preventScroll: true });
    // Ack the first received state to cover either side loading first, without
    // generating an echo loop when the host responds to a ready event.
    if (!receivedState) { receivedState = true; post("ready"); }
  });
  render();
  if (embedded) post("ready");
})();
