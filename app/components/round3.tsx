"use client";
/* Measured reliability (Trust & Audit), guideline insights with clarified-rule replay (Company Hub),
   and the creators' common-mistakes panel (Scan & Detect). */
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, FlaskConical, History, Lightbulb, Loader2, PlayCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { SwitchRole, useDemo } from "./demo-context";
import { Action, Data, Row, api, formatDate, formatTime } from "./shared";

const REPO = "https://github.com/DuvvuruDeepakReddy18/brandora/blob/main/";
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

/* ---------- Measured reliability ---------- */
export function ReliabilityReport() {
  const [report, setReport] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api("/reliability")
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  if (error) return <div className="inline-warn"><AlertTriangle size={15} /> {error}</div>;
  if (!report) return <div className="empty-mini"><Loader2 size={18} className="spin" /> Running the labelled evaluation…</div>;
  const held = report.splits.heldout,
    dev = report.splits.dev;
  return (
    <div className="r3-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Measured reliability</h2>
            <p>
              {report.dataset.items} labelled pieces of fictional Inkloom AI content, checked by the same rule engine that checks your content. It runs here when you open this page and in CI on every push to GitHub.
            </p>
          </div>
          <button className="button small" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Re-run now
          </button>
        </div>
        <div className="metric-row">
          <div className={"metric-card " + (held.precision >= 0.95 ? "good" : "warn")}>
            <small>Held-out precision</small>
            <b>{pct(held.precision)}</b>
            <span>{held.tp} of {held.tp + held.fp} findings raised on unseen items were correct</span>
          </div>
          <div className={"metric-card " + (held.recall >= 0.95 ? "good" : "warn")}>
            <small>Held-out recall</small>
            <b>{pct(held.recall)}</b>
            <span>{held.tp} of {held.tp + held.fn} labelled problems were found</span>
          </div>
          <div className={"metric-card " + (report.citations.rate === 1 ? "good" : "warn")}>
            <small>Citation validity</small>
            <b>{report.citations.valid}/{report.citations.checked}</b>
            <span>Every shown finding cites the current approved source, and that source contains the cited value or words</span>
          </div>
          <div className={"metric-card " + (report.clean_controls.with_findings === 0 ? "good" : "warn")}>
            <small>Clean controls flagged</small>
            <b>{report.clean_controls.with_findings}/{report.clean_controls.items}</b>
            <span>Correct content where Brandora still raised something</span>
          </div>
        </div>
        <p className="form-note">
          Development items ({dev.items}) were used while building the checks and score {pct(dev.precision)} precision and {pct(dev.recall)} recall. Held-out items ({held.items}) were written after the checks were frozen and are reported exactly as they came out. The misses below are left unfixed on purpose, so this score stays honest.
        </p>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>By split and category</h2>
            <p>Correct = rule, outcome and location all match the label. Missed = a labelled problem with no matching finding.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Group</th><th>Items</th><th>Precision</th><th>Recall</th><th>Correct</th><th>False alarms</th><th>Missed</th></tr>
            </thead>
            <tbody>
              {[["Development", dev], ["Held-out", held], ["All items", report.overall]].map(([name, r]: any) => (
                <tr key={name}>
                  <td><b>{name}</b></td><td className="num">{r.items}</td><td className="num">{pct(r.precision)}</td><td className="num">{pct(r.recall)}</td><td className="num">{r.tp}</td><td className="num">{r.fp}</td><td className="num">{r.fn}</td>
                </tr>
              ))}
              {report.categories.map((c: Row) => (
                <tr key={c.category}>
                  <td>{c.category.replace(/-/g, " ")}</td><td className="num">{c.items}</td><td className="num">{pct(c.precision)}</td><td className="num">{pct(c.recall)}</td><td className="num">{c.tp}</td><td className="num">{c.fp}</td><td className="num">{c.fn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Known misses and false alarms ({report.failures.length})</h2>
            <p>Each one is a concrete next improvement. Nothing here is hidden from the score.</p>
          </div>
        </div>
        <div className="failure-list">
          {report.failures.map((f: Row) => (
            <div key={f.id + f.detail} className={"failure tone-" + (f.kind === "Missed" ? "orange" : "yellow")}>
              <b>{f.kind}</b> <small>· {f.id} · {f.split === "heldout" ? "held-out" : "development"} · {f.category}</small>
              <q>{f.text}</q>
              <small>{f.detail}</small>
              {f.why && <p style={{ margin: "4px 0 0" }}>{f.why}</p>}
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>How this is measured</h2>
          </div>
        </div>
        <p className="form-note" style={{ marginTop: 0 }}>{report.method}</p>
        <p className="form-note">
          {report.dataset.labelled_by} Dataset SHA-256 {String(report.dataset.sha256).slice(0, 12)} · engine SHA-256 {String(report.engine_sha256).slice(0, 12)} · rules {report.register.join(", ")}.{" "}
          <a className="text-button" href={REPO + "backend/eval/dataset.json"} target="_blank" rel="noreferrer">Read the dataset</a>{" "}
          <a className="text-button" href={REPO + "backend/evaluation.py"} target="_blank" rel="noreferrer">Read the evaluator</a>
        </p>
      </section>
    </div>
  );
}

/* ---------- Guideline insights ---------- */
const TEAM_COLOURS: Record<string, string> = { "Internal team": "var(--t-blue)", "Partner agencies": "var(--t-orange)" };

function changedKeys(a: Record<string, unknown> = {}, b: Record<string, unknown> = {}) {
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
const show = (v: unknown) => (v === undefined ? "not set" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v));

export function GuidelineInsights({ data, action, busy, notify }: { data: Data; action: Action; busy: boolean; notify: (s: string) => void }) {
  const demo = useDemo();
  const [insight, setInsight] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0),
    [by, setBy] = useState<"by_channel" | "by_campaign" | "by_team">("by_channel");
  const role = data.user.role;
  useEffect(() => {
    if (!["manager", "reviewer"].includes(role)) return;
    setError("");
    api("/insights").then(setInsight).catch((e) => setError(e.message));
  }, [role, tick, data.workspace.revision]);
  if (!["manager", "reviewer"].includes(role))
    return (
      <section className="panel">
        <div className="empty-mini">
          <p>Guideline insights are for reviewers and managers. Creators see the most common mistakes in Scan & Detect instead.</p>
          <SwitchRole role="reviewer" />
        </div>
      </section>
    );
  if (error) return <div className="inline-warn"><AlertTriangle size={15} /> {error}</div>;
  if (!insight) return <div className="empty-mini"><Loader2 size={18} className="spin" /> Reading recorded findings and decisions…</div>;
  const run = async (path: string, body?: unknown, message?: string) => {
    const r = await action(path, "POST", body, message);
    if (r) setTick((t) => t + 1);
    return r;
  };
  const draft = (u: Row) =>
    run(
      "/rule-proposals",
      {
        rule_id: u.rule_id,
        config: u.suggestion.config,
        rationale: `${u.signals.join(" ")}${u.reviewer_reason ? ` Reviewers' reason: “${u.reviewer_reason}”` : ""}`.slice(0, 1000),
      },
      "Clarification drafted · replay it on history next",
    );
  const s = insight.summary;
  return (
    <div className="r3-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Guideline insights</h2>
            <p>
              From {s.findings} recorded findings and {s.decisions} reviewer decisions{s.since ? ` since ${formatDate(s.since)}` : ""}. Contributors are grouped by team, never scored as individuals.
            </p>
          </div>
          {s.fictional > 0 && (
            <span className="fiction-tag" title="Seeded for the demo by running the real rule engine on fictional drafts">
              Includes {s.fictional} fictional history records
            </span>
          )}
        </div>
        <h3 className="subhead"><BarChart3 size={15} /> Recurring mistakes</h3>
        <div className="insight-cards">
          {insight.recurring.slice(0, 6).map((r: Row) => {
            const total = Object.values(r.teams as Record<string, number>).reduce((a, b) => a + b, 0) || 1;
            const channel = Object.entries(r.channels as Record<string, number>)[0];
            const campaign = Object.entries(r.campaigns as Record<string, number>)[0];
            return (
              <div key={r.rule_code} className="insight-card">
                <small>{r.rule_code}</small>
                <h3 className="insight-title">{r.title}</h3>
                <div>
                  <span className="count">{r.count}</span> <small>findings · {r.last_30_days} in the last 30 days{r.previous_30_days ? `, ${r.previous_30_days} in the 30 before` : ""}</small>
                </div>
                {r.example && <small>Most often “{r.example}”{r.example_count > 1 ? ` (${r.example_count}×)` : ""}</small>}
                <small>Mostly on {channel?.[0]}{campaign?.[0] ? ` · ${campaign[0]}` : ""}</small>
                <div className="bar" title={Object.entries(r.teams).map(([k, v]) => `${k}: ${v}`).join(" · ")}>
                  {Object.entries(r.teams as Record<string, number>).map(([team, n]) => (
                    <i key={team} style={{ width: `${(n / total) * 100}%`, background: TEAM_COLOURS[team] || "var(--t-grey)" }} />
                  ))}
                </div>
                <small>
                  {Object.entries(r.teams).map(([k, v]) => `${k} ${v}`).join(" · ")} · reviewers confirmed {r.confirmed}, overrode {r.overridden}
                </small>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Where mistakes happen</h2>
          </div>
          <div className="filter-row" role="group" aria-label="Breakdown">
            {([["by_channel", "Channel"], ["by_campaign", "Campaign"], ["by_team", "Team"]] as const).map(([k, label]) => (
              <button key={k} className={by === k ? "active" : ""} onClick={() => setBy(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>{by === "by_team" ? "Team" : by === "by_channel" ? "Channel" : "Campaign"}</th><th>Findings</th><th>Most frequent rules</th></tr></thead>
            <tbody>
              {insight[by].map((row: Row) => (
                <tr key={row.name}>
                  <td><b>{row.name}</b></td>
                  <td className="num">{row.count}</td>
                  <td>{row.top_rules.map((t: Row) => `${t.rule_code} (${t.count})`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Possibly unclear rules</h2>
            <p>Flagged when reviewers keep overriding a rule, or when most of its findings need a judgement call instead of a clear verdict.</p>
          </div>
        </div>
        {!insight.unclear.length && <div className="empty-mini ok"><CheckCircle2 size={20} /><p>No rule is being overridden often enough to look unclear.</p></div>}
        <div className="r3-stack">
          {insight.unclear.map((u: Row) => {
            const open = insight.proposals.find((p: Row) => p.rule_id === u.rule_id && ["Draft", "Replayed"].includes(p.status));
            const applied = insight.proposals.find((p: Row) => p.rule_id === u.rule_id && p.status === "Applied");
            return (
              <div key={u.rule_code} className="unclear-card">
                <h3 className="unclear-title"><AlertTriangle size={15} /> {u.rule_code} · {u.title}</h3>
                <ul>{u.signals.map((x: string) => <li key={x}>{x}</li>)}</ul>
                {u.reviewer_reason && <p style={{ margin: 0 }}>Reviewers' most common reason: “{u.reviewer_reason}”</p>}
                <div className="suggestion-box">
                  <small>{u.suggestion.type === "config" ? "SUGGESTED CLARIFICATION" : "SUGGESTED ACTION"}</small>
                  {u.suggestion.text}
                </div>
                {applied && (
                  <p className="form-note" style={{ margin: 0 }}>
                    <ShieldCheck size={13} /> Clarified by {applied.decided_by} on {formatTime(applied.decided)}. These signals come from decisions made under the earlier wording.
                  </p>
                )}
                {u.suggestion.type === "config" && !applied && (
                  <div className="proposal-actions">
                    {open ? (
                      <span className="form-note">A clarification is already drafted below.</span>
                    ) : (
                      <button className="button small primary" disabled={busy} onClick={() => draft(u)}>
                        <Lightbulb size={14} /> Draft this clarification
                      </button>
                    )}
                    {demo.active && role === "manager" && !open && (
                      <span className="form-note">A different manager must approve your own draft. In this demo, draft it as the reviewer and approve it as the manager. <SwitchRole role="reviewer" /></span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Clarified rules</h2>
            <p>Draft → replay on recorded history (predicted vs what reviewers actually decided) → a different manager approves → the rule changes with an audit record and affected content is re-checked.</p>
          </div>
        </div>
        {!insight.proposals.length && <div className="empty-mini"><p>No clarifications yet. Draft one from a flagged rule above.</p></div>}
        <div className="r3-stack">
          {insight.proposals.map((p: Row) => (
            <Proposal key={p.id} p={p} data={data} busy={busy} run={run} notify={notify} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Proposal({ p, data, busy, run, notify }: { p: Row; data: Data; busy: boolean; run: (path: string, body?: unknown, message?: string) => Promise<any>; notify: (s: string) => void }) {
  const [note, setNote] = useState("");
  const role = data.user.role;
  const base = p.status === "Applied" && p.replay?.previous_config ? p.replay.previous_config : p.current_config;
  const baseValue = p.status === "Applied" && p.replay?.previous_value ? p.replay.previous_value : p.current_value;
  const keys = changedKeys(base, p.config);
  const replay = p.replay || {};
  const own = p.proposer_id === data.user.id;
  const live = ["Draft", "Replayed"].includes(p.status);
  return (
    <div className="proposal">
      <div className="proposal-head">
        <h4>{p.rule_code} · {p.rule_title}</h4>
        <span className={"status-chip tone-" + (p.status === "Applied" ? "green" : p.status === "Discarded" ? "grey" : p.status === "Replayed" ? "blue" : "yellow")}><i />{p.status}</span>
      </div>
      <small className="label">PROPOSED BY {String(p.proposer).toUpperCase()} · {formatTime(p.created)}</small>
      <p style={{ margin: 0 }}>{p.rationale}</p>
      <div className="config-diff">
        <div>
          <small className="label">{p.status === "Applied" ? "RULE BEFORE" : "CURRENT RULE"}</small>
          <pre>{keys.map((k) => `${k}: ${show(base?.[k])}`).join("\n") || "value: " + baseValue}</pre>
        </div>
        <div>
          <small className="label">CLARIFIED RULE</small>
          <pre>{keys.map((k) => `${k}: ${show(p.config?.[k])}`).join("\n") || "value: " + p.value}</pre>
        </div>
      </div>
      {p.status === "Replayed" || p.replay?.rule_hash ? (
        <>
          <div className="replay-summary">
            <div>
              <b>{pct(replay.agreement_before)} → {pct(replay.agreement_after)}</b>
              <span>Agreement with {replay.decided} recorded reviewer decisions</span>
            </div>
            <div>
              <b className={replay.confirmed_missed ? "verdict-bad" : "verdict-ok"}>{replay.confirmed_missed}</b>
              <span>Confirmed issues the clarified rule would miss ({replay.confirmed_kept} still caught)</span>
            </div>
            <div>
              <b>{replay.overrides_removed}</b>
              <span>Findings reviewers overrode that would no longer be raised ({replay.overrides_kept} still raised)</span>
            </div>
          </div>
          <details>
            <summary><History size={13} /> Predicted vs actual on {replay.history_rows} recorded findings</summary>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Content</th><th>Channel</th><th>Text</th><th>Reviewer decided</th><th>Clarified rule</th><th>Result</th></tr></thead>
                <tbody>
                  {(replay.rows || []).map((r: Row, i: number) => (
                    <tr key={i}>
                      <td>{r.content}</td><td>{r.channel}</td><td>“{r.span}”</td><td>{r.reviewer}</td><td>{r.after}</td>
                      <td className={r.verdict === "Matches reviewer" ? "verdict-ok" : r.verdict === "No decision recorded" ? "verdict-mid" : "verdict-bad"}>{r.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="form-note">
              {replay.current_content?.length
                ? `Current content affected: ${replay.current_content.map((c: Row) => `${c.content} (+${c.added} / −${c.removed})`).join(", ")}.`
                : "No current content would change."}{" "}
              Replayed {replay.replayed ? formatTime(replay.replayed) : ""}.
            </p>
          </details>
          {p.stale && <p className="inline-warn small"><AlertTriangle size={14} /> The rule changed after this replay. Replay it again before applying.</p>}
        </>
      ) : null}
      {p.status === "Applied" && <p className="form-note"><ShieldCheck size={13} /> Applied by {p.decided_by} on {formatTime(p.decided)}: “{p.decision_note}”. Recorded in the audit trail; affected content was flagged for re-checking.</p>}
      {p.status === "Discarded" && <p className="form-note"><XCircle size={13} /> Discarded by {p.decided_by}: “{p.decision_note}”.</p>}
      {live && (
        <>
          <div className="proposal-actions">
            {["manager", "reviewer"].includes(role) && (
              <button className="button small" disabled={busy} onClick={() => run(`/rule-proposals/${p.id}/replay`, undefined, "Replayed on recorded history · nothing was changed")}>
                <PlayCircle size={14} /> {p.status === "Replayed" ? "Replay again" : "Replay on history"}
              </button>
            )}
            {role !== "manager" && p.status === "Replayed" && (
              <span className="form-note">A manager approves clarified rules. <SwitchRole role="manager" /></span>
            )}
            {role === "manager" && own && <span className="form-note">You proposed this, so a different manager must approve it.</span>}
          </div>
          {role === "manager" && (
            <div className="decision-form">
              <label>
                <span>Decision note (kept in the audit trail)</span>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this clarification is right, or why it is not." />
              </label>
              <div>
                <button className="button small" disabled={busy || note.trim().length < 10} onClick={() => run(`/rule-proposals/${p.id}/discard`, { note }, "Clarification discarded")}>
                  Discard
                </button>
                <button
                  className="button small primary"
                  disabled={busy || own || p.status !== "Replayed" || p.stale || note.trim().length < 10}
                  title={own ? "A different manager must approve your own proposal." : p.status !== "Replayed" ? "Replay it on history first." : undefined}
                  onClick={async () => {
                    const r = await run(`/rule-proposals/${p.id}/apply`, { note }, "Clarified rule applied · audit record written");
                    if (r) notify("Content that relied on the old rule is flagged for re-checking.");
                  }}
                >
                  <ShieldCheck size={14} /> Approve and apply
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Creators: the mistakes reviewers keep confirming ---------- */
export function CommonMistakes({ revision }: { revision: number }) {
  const [tips, setTips] = useState<Row[]>([]);
  useEffect(() => {
    api("/insights/tips").then(setTips).catch(() => setTips([]));
  }, [revision]);
  if (!tips.length) return null;
  return (
    <aside className="tips-panel">
      <h3><Lightbulb size={15} /> Before you upload: common mistakes from recent reviews</h3>
      <ul>
        {tips.map((t) => (
          <li key={t.rule_code}>
            <b>{t.tip}.</b> <small>{t.count} recent findings{t.example ? `, most often “${t.example}”` : ""}.</small>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/* ---------- Integrations: the check-before-publish API ---------- */
const SAMPLE_CHECK = "Try Inkloom AI free for 30 days. Professional is only ₹1,499/month!";
export function IntegrationsPanel({ data, action, busy }: { data: Data; action: Action; busy: boolean }) {
  const [keys, setKeys] = useState<Row[]>([]),
    [name, setName] = useState("CMS publishing check"),
    [fresh, setFresh] = useState(""),
    [text, setText] = useState(SAMPLE_CHECK),
    [channel, setChannel] = useState("Website"),
    [result, setResult] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const manager = data.user.role === "manager";
  const load = useCallback(() => {
    if (manager) api("/api-keys").then(setKeys).catch(() => setKeys([]));
  }, [manager]);
  useEffect(load, [load, data.workspace.revision]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const curl = `curl -X POST ${origin}/api/v1/check \\\n  -H "Authorization: Bearer ${fresh || "brk_your_key"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text": "${SAMPLE_CHECK.replace(/'/g, "")}", "channel": "Website"}'`;
  const create = async () => {
    const r = await action("/api-keys", "POST", { name }, "API key created · copy it now");
    if (r?.key) {
      setFresh(r.key);
      load();
    }
  };
  const send = async () => {
    setSending(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/v1/check", {
        method: "POST",
        headers: { Authorization: `Bearer ${fresh}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text, channel }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Request failed");
      setResult(body);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="r3-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Check before publishing (API)</h2>
            <p>
              Connect a CMS, a publishing webhook (Zapier, Make) or a deploy pipeline. Before anything goes live, it sends the copy to Brandora and gets a verdict with evidence. The API runs the rule checks only: it never sends text to an AI provider, never approves and never publishes.
            </p>
          </div>
        </div>
        {!manager ? (
          <div className="empty-mini">
            <p>Managers create and revoke API keys.</p>
            <SwitchRole role="manager" />
          </div>
        ) : (
          <>
            <div className="proposal-actions">
              <label className="field" style={{ flex: "1 1 260px", margin: 0 }}>
                <span>Key name</span>
                <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              </label>
              <button className="button primary" disabled={busy || name.trim().length < 2} onClick={create}>
                Create API key
              </button>
            </div>
            {fresh && (
              <div className="suggestion-box" style={{ marginTop: 12 }}>
                <small>NEW KEY · SHOWN ONCE · BRANDORA STORES ONLY A HASH</small>
                <code style={{ wordBreak: "break-all" }}>{fresh}</code>
              </div>
            )}
            {keys.length > 0 && (
              <div className="table-scroll" style={{ marginTop: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th>Calls</th><th /></tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id}>
                        <td><b>{k.name}</b><small className="block muted">by {k.creator}</small></td>
                        <td><code>{k.prefix}…</code></td>
                        <td>{formatTime(k.created)}</td>
                        <td>{k.last_used ? formatTime(k.last_used) : "—"}</td>
                        <td className="num">{k.uses}</td>
                        <td>
                          {k.revoked ? (
                            <span className="status-chip tone-grey"><i />Revoked</span>
                          ) : (
                            <button className="button small" disabled={busy} onClick={() => action(`/api-keys/${k.id}/revoke`, "POST", undefined, "API key revoked").then(load)}>
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Try it</h2>
            <p>{fresh ? "Sends a real request with your new key, exactly as your CMS would." : "Create a key above to send a real request from here."}</p>
          </div>
        </div>
        <div className="r3-stack" style={{ gap: 10 }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Copy to check</span>
            <textarea rows={3} value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="proposal-actions">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
              {["Website", "Email", "Social", "Advertisement"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="button primary" disabled={!fresh || sending || !text.trim()} onClick={send}>
              {sending ? <Loader2 size={14} className="spin" /> : <PlayCircle size={14} />} Send test request
            </button>
          </div>
          {error && <div className="inline-warn"><AlertTriangle size={15} /> {error}</div>}
          {result && (
            <div className={"unclear-card"} style={{ background: "#fff", borderColor: "var(--line)" }}>
              <h4>
                <span className={"status-chip tone-" + (result.verdict === "blocked" ? "red" : result.verdict === "needs_review" ? "yellow" : "green")}><i />{result.verdict}</span>{" "}
                {result.summary}
              </h4>
              <ul>
                {result.findings.map((f: Row) => (
                  <li key={f.id}>
                    <b>{f.rule} · {f.title}</b>{f.span ? ` — “${f.span}”` : ""}{f.suggestion ? ` → “${f.suggestion}”` : ""}
                    {f.evidence && <small className="block muted">{f.evidence.source} v{f.evidence.version}</small>}
                  </li>
                ))}
              </ul>
              <details>
                <summary>Raw JSON response</summary>
                <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          )}
          <details>
            <summary>Call it from your own system (curl)</summary>
            <pre className="json-block">{curl}</pre>
            <p className="form-note">
              Add <code>{'"submit": true'}</code> to also place the draft in Verify & Review for a person to approve. Full reference:{" "}
              <a className="text-button" href={REPO + "docs/API.md"} target="_blank" rel="noreferrer">docs/API.md</a>
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}

export function Round3Spotlight({ onExplore }: { onExplore: (key: "brochure" | "deck" | "reliability" | "insights") => void }) {
  const items = [
    { key: "brochure" as const, title: "10-page brochure, page by page", text: "Marks on every page, zoom, measured contrast and tiny text" },
    { key: "deck" as const, title: "Sales deck with accessibility", text: "Slides with missing alt text, low contrast and tone issues" },
    { key: "reliability" as const, title: "Measured reliability", text: "80 labelled items: precision, recall and citation validity" },
    { key: "insights" as const, title: "Guideline insights", text: "Recurring mistakes, an unclear rule, replay and approval" },
  ];
  return (
    <section className="panel r3-spotlight">
      <div className="panel-header">
        <div>
          <h2><FlaskConical size={16} /> New: documents, tone, accessibility, reliability and insights</h2>
          <p>Each opens on a ready-made example. Everything here runs on the rule engine with no AI.</p>
        </div>
      </div>
      <div className="insight-cards">
        {items.map((x) => (
          <button key={x.key} className="insight-card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => onExplore(x.key)}>
            <h3 className="insight-title">{x.title}</h3>
            <small>{x.text}</small>
            <span className="text-button">Open <ArrowRight size={13} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}
