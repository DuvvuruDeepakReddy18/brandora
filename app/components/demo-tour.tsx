"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Download,
  FlaskConical,
  LogOut,
  RotateCcw,
} from "lucide-react";

export type TourStep = "inspect" | "review" | "fix" | "impact" | "ai";
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
  collapsed?: boolean;
};

const STEPS: { key: TourStep; title: string; as: string; text: string; cta: string }[] = [
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
    text: "Confirm the price issue, mark the GST note as reviewed, request evidence for the 80% claim. Every decision is recorded with a reason.",
    cta: "Review as Sam",
  },
  {
    key: "fix",
    title: "Fix, re-check, approve",
    as: "creator",
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
    title: "Try live AI on your own ad",
    as: "manager",
    text: "Enable AI, then upload the sample ad or any creative in Scan & Detect. Findings are generated from OCR and logo comparison, not sample data.",
    cta: "Enable AI",
  },
];

export function DemoTour(props: Props) {
  const [open, setOpen] = useState(!props.collapsed);
  useEffect(() => {
    setOpen(!props.collapsed);
  }, [props.collapsed]);
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
          {["creator", "reviewer", "manager", "partner"].map((role) => (
            <button
              key={role}
              disabled={props.busy}
              aria-pressed={props.role === role}
              onClick={() => props.onRole(role)}
            >
              {role}
            </button>
          ))}
        </div>
        <div className="judge-demo-actions">
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
      <details
        className="judge-demo-guide"
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>Five-step walkthrough · about 5 minutes</summary>
        <div className="tour-steps">
          {STEPS.map((s, i) => (
            <div key={s.key} className="tour-step">
              <span className="tour-num">0{i + 1}</span>
              <b>{s.title}</b>
              <small>as {s.as}</small>
              <p>
                {s.key === "ai" && props.aiEnabled
                  ? "AI is enabled. Upload the sample ad or any creative in Scan & Detect, or use “Re-read with live AI” on the sample."
                  : s.text}
              </p>
              <button disabled={props.busy} onClick={() => props.onStep(s.key)}>
                {s.key === "ai" && props.aiEnabled ? "AI settings" : s.cta} <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="judge-demo-files">
          <span>Sample files</span>
          {[
            ["creative.png", "Wrong ad (PNG)"],
            ["logo.png", "Approved logo"],
            ["scanned-source.pdf", "Scanned pricing policy"],
          ].map(([file, label]) => (
            <a key={file} href={`/api/demo/assets/${file}`} download>
              <Download size={13} />
              {label}
            </a>
          ))}
        </div>
        <p className="judge-demo-footnote">
          Role switching simulates separate teammates; permissions are still enforced by the API. Live AI is capped at {props.aiLimit} requests per session per day and only runs after a manager enables it.
        </p>
      </details>
    </section>
  );
}
