import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CREW_CHANNEL, readCrewAction } from "../app/components/brand-crew-protocol.mjs";

const origin = "https://brandora-omega-three.vercel.app";
const frame = {};
const message = (type) => ({ origin, source: frame, data: { channel: CREW_CHANNEL, version: 1, type } });
test("bridge accepts only current-frame login/demo/lifecycle messages", () => {
  for (const type of ["ready", "login", "demo"]) assert.equal(readCrewAction(message(type), frame, origin), type);
  for (const type of ["approve", "export", "settings", "ui-state"]) assert.equal(readCrewAction(message(type), frame, origin), null);
});
test("cross-origin, other-frame, stale and malformed messages cannot request actions", () => {
  for (const event of [
    { ...message("demo"), origin: "https://untrusted.invalid" },
    { ...message("demo"), source: {} },
    { ...message("demo"), data: null },
    { ...message("demo"), data: [] },
    { ...message("demo"), data: "demo" },
    { ...message("demo"), data: { ...message("demo").data, version: 2 } },
    { ...message("demo"), data: { ...message("demo").data, channel: "other" } },
    { ...message("demo"), data: { ...message("demo").data, credentials: "unexpected" } },
  ]) assert.equal(readCrewAction(event, frame, origin), null);
  assert.equal(readCrewAction(message("demo"), null, origin), null);
});
test("generated landing retains pinned scenes, truth labels and an isolated bridge", () => {
  const html = fs.readFileSync(new URL("../public/brand-crew/index.html", import.meta.url), "utf8");
  for (const text of ["three@0.170.0", "lenis@1.1.13", "makeRobot(", "STATION_ASSETS", "AUDIT", "Illustrative local check", "fictional demonstration evidence", "host-bridge.js", "host-still.js", "forceContextLoss"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/Explore demo <svg>/g) || []).length, 4);
  assert.ok(!html.includes("Download demo request"));
  assert.ok(!html.includes("Book a demo"));
  assert.ok(!html.includes("/api/"));
  const module = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  new vm.Script(module); // Dynamic imports are valid; this only parses, not executes.
});

test("the no-WebGL fallback shows a still of the real scene and how to see the original", () => {
  const still = fs.readFileSync(new URL("../public/brand-crew/host-still.js", import.meta.url), "utf8");
  for (const text of [".world-fallback", "world-still.webp", "world-still-mobile.webp", "Use graphics acceleration when available", "MutationObserver"]) assert.ok(still.includes(text), text);
  assert.ok(!still.includes("/api/"));
  for (const file of ["world-still.webp", "world-still-mobile.webp"]) assert.ok(fs.statSync(new URL(`../public/brand-crew/${file}`, import.meta.url)).size > 10000, file);
  new vm.Script(still);
});
