"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  FlaskConical,
  LogOut,
  PlayCircle,
  RotateCcw,
} from "lucide-react";

export const STORY_URL = "/brand-crew/index.html?tour=1";

export type TourStep = "inspect" | "review" | "fix" | "impact" | "ai" | "partner";
export type ExploreKey =
  | "samples"
  | "hub"
  | "import"
  | "conflicts"
  | "lineage"
  | "logos"
  | "team"
  | "audit"
  | "report"
  | "translate"
  | "brochure"
  | "deck"
  | "reliability"
  | "insights";
type Props = {
  role: string;
  expires: string;
  aiLimit: number;
  busy: boolean;
  aiEnabled: boolean;
  onRole: (role: string) => void;
  onExit: () => void;
  onReset: () => void;
  onStep: (step: TourStep) => void;
  onExplore: (key: ExploreKey) => void;
  progress: Partial<Record<TourStep, boolean>>;
  collapsed?: boolean;
};

const ROLES: Record<string, { who: string; can: string; cannot: string }> = {
  creator: {
    who: "Alex Morgan · Creator",
    can: "upload and scan content, apply fixes and request review",
    cannot: "approve their own work or change Company Hub",
  },
  reviewer: {
    who: "Sam Rivera · Reviewer",
    can: "confirm, reject or escalate findings and approve exact versions",
    cannot: "edit content or change Company Hub",
  },
  manager: {
    who: "Maya Chen · Manager",
    can: "own Company Hub, team and AI settings, publish fact changes and review others' work",
    cannot: "approve content they edited",
  },
  partner: {
    who: "Jordan Lee · Partner (outside agency)",
    can: "draft and scan content only in the Spring launch campaign",
    cannot: "see internal campaigns (hidden by the server, not just the screen)",
  },
};

export const STEPS: { key: TourStep; title: string; as: string; text: string; cta: string }[] = [
  {
    key: "inspect",
    title: "See the marked-up ad",
    as: "creator",
    text: "An employee uploaded a wrong Inkloom AI ad. Six numbered marks show what contradicts or is unsupported by Company Hub. Click any mark to see its evidence.",
    cta: "Open the ad",
  },
  {
    key: "review",
    title: "Decide as a reviewer",
    as: "reviewer",
    text: "Confirm the price issue, mark the GST note as reviewed, request evidence for the 80% claim. Every decision needs a reason and is logged.",
    cta: "Review as Sam",
  },
  {
    key: "fix",
    title: "Fix, re-check, approve",
    as: "creator → reviewer",
    text: "Apply all suggestions, save and re-check (it comes back clean), request review. Then switch to Reviewer and approve. Compare original vs corrected.",
    cta: "Fix as Alex",
  },
  {
    key: "impact",
    title: "Change a fact",
    as: "manager",
    text: "In Impact Monitor, change the free trial from 14 to 7 days. The old version is kept and every linked item, including approved ones, is flagged.",
    cta: "Open Impact Monitor",
  },
  {
    key: "ai",
    title: "Try live AI on an image",
    as: "creator",
    text: "Live AI is on in this demo. In Scan & Detect, use the wrong or corrected ad image, or press “Re-read with live AI” on the ad. Findings then come from real OCR and logo comparison.",
    cta: "Try an image",
  },
  {
    key: "partner",
    title: "See partner isolation",
    as: "partner",
    text: "Jordan, an outside agency, sees only the Spring launch campaign. The internal Asset Vault page disappears because the server refuses it.",
    cta: "View as Jordan",
  },
];

const EXPLORE: { key: ExploreKey; title: string; text: string }[] = [
  { key: "brochure", title: "10-page brochure, page by page", text: "Page navigation, zoom, measured contrast and tiny text" },
  { key: "deck", title: "Sales deck: tone & accessibility", text: "Missing alt text, low contrast and off-brand wording" },
  { key: "reliability", title: "Measured reliability", text: "80 labelled items: precision, recall, citation validity" },
  { key: "insights", title: "Guideline insights", text: "Recurring mistakes, an unclear rule, replay, approval" },
  { key: "samples", title: "Upload sample files", text: "Brochure PDF and social caption that work without AI" },
  { key: "hub", title: "Company Hub records", text: "Pricing, claims, policies and evidence the checks use" },
  { key: "import", title: "Import a policy document", text: "Turn a sample billing policy into an approved source" },
  { key: "conflicts", title: "Resolve a source conflict", text: "Two price sheets disagree about the Asset Vault add-on" },
  { key: "lineage", title: "Trace a fact", text: "See every item that relies on one approved value" },
  { key: "logos", title: "Logos & colour checks", text: "Approved logo register, palette and contrast" },
  { key: "team", title: "Team & roles", text: "Add a teammate and assign campaign access" },
  { key: "audit", title: "Audit trail & receipts", text: "Every upload, decision, approval and change" },
  { key: "report", title: "Download a review report", text: "An annotated HTML report for the sample ad" },
  { key: "translate", title: "Translate a draft (AI)", text: "Protected prices and names, with a language review" },
];

export function DemoTour(props: Props) {
  const [open, setOpen] = useState(!props.collapsed);
  useEffect(() => {
    setOpen(!props.collapsed);
  }, [props.collapsed]);
  const done = STEPS.filter((s) => props.progress[s.key]).length;
  const next = STEPS.find((s) => !props.progress[s.key]);
  const role = ROLES[props.role];
  return (
    <section className="judge-demo" aria-label="Demo controls">
      <div className="judge-demo-top">
        <div className="judge-demo-title">
          <FlaskConical size={20} />
          <div>
            <strong>Your private demo · Inkloom AI (fictional company)</strong>
            <span>
              Isolated sample workspace · expires{" "}
              {new Date(props.expires).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <div className="judge-demo-roles" role="group" aria-label="Switch demo role">
          <span>Acting as</span>
          {["creator", "reviewer", "manager", "partner"].map((r) => (
            <button
              key={r}
              disabled={props.busy}
              aria-pressed={props.role === r}
              onClick={() => props.onRole(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="judge-demo-actions">
          <a className="story-link" href={STORY_URL} target="_blank" rel="noopener" title="Opens the landing page in a new tab and auto-plays it">
            <PlayCircle size={14} />
            Watch the product story
          </a>
          <button disabled={props.busy} onClick={props.onReset}>
            <RotateCcw size={14} />
            Reset
          </button>
          <button disabled={props.busy} onClick={props.onExit}>
            <LogOut size={14} />
            Leave
          </button>
        </div>
      </div>
      {role && (
        <p className="role-guide">
          <b>{role.who}</b> — can {role.can}. Cannot {role.cannot}. Switching people is a demo shortcut; the server still enforces each role.
        </p>
      )}
      <details
        className="judge-demo-guide"
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>
          Guided walkthrough · {done}/{STEPS.length} done
          {!open && next && (
            <button
              className="next-step"
              disabled={props.busy}
              onClick={(e) => {
                e.preventDefault();
                props.onStep(next.key);
              }}
            >
              Next: {next.title} <ArrowRight size={12} />
            </button>
          )}
          {!open && !next && <span className="all-done"> · All steps done. Explore more below.</span>}
        </summary>
        <div className="tour-steps">
          {STEPS.map((s, i) => {
            const complete = !!props.progress[s.key];
            return (
              <div key={s.key} className={"tour-step" + (complete ? " done" : "") + (next?.key === s.key ? " next" : "")}>
                <span className="tour-num">
                  {complete ? <Check size={12} /> : `0${i + 1}`}
                  {next?.key === s.key && <em>Next</em>}
                </span>
                <b>{s.title}</b>
                <small>as {s.as}</small>
                <p>
                  {s.key === "ai" && !props.aiEnabled
                    ? "A manager turned AI off. Switch to Manager and turn it back on in Trust & Audit → Privacy & AI, then use the sample ad images in Scan & Detect."
                    : s.text}
                </p>
                <button disabled={props.busy} onClick={() => props.onStep(s.key)}>
                  {s.key === "ai" && !props.aiEnabled ? "Turn AI on" : s.cta} <ArrowRight size={13} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="explore-row">
          <span>More to explore</span>
          <div>
            {EXPLORE.map((x) => (
              <button key={x.key} disabled={props.busy} onClick={() => props.onExplore(x.key)}>
                <b>{x.title}</b>
                <small>{x.text}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="judge-demo-files">
          <span>Sample files</span>
          {[
            ["festive-brochure-10-pages.pdf", "10-page brochure"],
            ["festive-brochure-corrected.pdf", "Corrected brochure"],
            ["partner-deck.pptx", "Sales deck (PPTX)"],
            ["brochure.pdf", "Brochure PDF"],
            ["social-post.txt", "Social caption"],
            ["creative.png", "Wrong ad image"],
            ["corrected-creative.png", "Corrected ad image"],
            ["billing-policy.txt", "Billing policy"],
            ["scanned-source.pdf", "Scanned pricing policy"],
            ["logo.png", "Approved logo"],
          ].map(([file, label]) => (
            <a key={file} href={`/api/demo/assets/${file}`} download>
              <Download size={13} />
              {label}
            </a>
          ))}
        </div>
        <p className="judge-demo-footnote">
          Live AI (Gemini) is {props.aiEnabled ? "on" : "off"} in this demo and capped at {props.aiLimit} requests per session per day; a manager can switch it in Trust &amp; Audit. If the cap or the provider stops a check, rule checks still run and the screen says AI is incomplete. Reset gives you a fresh copy at any time.
        </p>
      </details>
    </section>
  );
}
