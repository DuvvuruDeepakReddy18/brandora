"use client";
import {
  ArrowRight,
  Download,
  FlaskConical,
  LogOut,
  RotateCcw,
} from "lucide-react";

type Props = {
  role: string;
  expires: string;
  aiLimit: number;
  busy: boolean;
  aiEnabled: boolean;
  onRole: (role: string) => void;
  onExit: () => void;
  onReset: () => void;
  onStart: () => void;
  onAI: () => void;
};

export function DemoTour(props: Props) {
  return (
    <section className="judge-demo" aria-label="Judge demo controls">
      <div className="judge-demo-top">
        <div className="judge-demo-title">
          <FlaskConical size={20} />
          <div>
            <strong>Your private demo</strong>
            <span>
              Fictional HarborDesk data · expires{" "}
              {new Date(props.expires).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <div className="judge-demo-actions">
          <button disabled={props.busy} onClick={props.onReset}>
            <RotateCcw size={14} />
            Reset samples
          </button>
          <button disabled={props.busy} onClick={props.onExit}>
            <LogOut size={14} />
            Leave demo
          </button>
        </div>
      </div>
      <div
        className="judge-demo-roles"
        role="group"
        aria-label="Switch demo role"
      >
        <span>Explore as</span>
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
      <details className="judge-demo-guide" open>
        <summary>A five-minute walkthrough</summary>
        <div className="judge-demo-grid">
          <div>
            <b>01 / Create → review → approve</b>
            <p>
              As creator, open Launch announcement. Correct the product name,
              remove the unsupported guarantee, use 14 days and include “billed
              annually”. Save, check, then request review. Switch to reviewer to
              approve.
            </p>
            <button disabled={props.busy} onClick={props.onStart}>
              Open sample draft <ArrowRight size={14} />
            </button>
          </div>
          <div>
            <b>02 / Follow the evidence</b>
            <p>
              Explore Claim DNA, Knowledge gaps and Source conflicts. As
              manager, change an approved source to see affected content need
              reassessment. Impact Lab previews changes; Time Machine keeps
              approval snapshots.
            </p>
          </div>
          <div>
            <b>03 / Try the AI tools</b>
            <p>
              {props.aiEnabled
                ? "AI is enabled. "
                : "Switch to manager and enable AI in Privacy & settings. "}
              Translate a draft in Content studio. Download the sample files
              below for Visual Guardian and scanned-source import. Your session
              has {props.aiLimit} AI requests per UTC day; shared limits also
              apply.
            </p>
            <button disabled={props.busy} onClick={props.onAI}>
              {props.aiEnabled ? "AI settings" : "Set up live AI"}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <div className="judge-demo-files">
          <span>Sample files</span>
          {[
            ["logo.png", "Approved logo"],
            ["creative.png", "Creative image"],
            ["scanned-source.pdf", "Scanned source PDF"],
          ].map(([file, label]) => (
            <a key={file} href={`/api/demo/assets/${file}`} download>
              <Download size={13} />
              {label}
            </a>
          ))}
        </div>
        <p className="judge-demo-footnote">
          This session is separate from the owner’s workspace and every other
          visitor. Use fictional data; selected material is sent to the AI
          provider only when you enable and use AI. Role switching is a demo
          simulation of separate teammates.
        </p>
      </details>
    </section>
  );
}
