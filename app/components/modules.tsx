"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Download,
  FileText,
  FlaskConical,
  GitBranch,
  History,
  Image as ImageIcon,
  Loader2,
  ScanLine,
  ShieldCheck,
  Upload,
  Wand2,
  XCircle,
} from "lucide-react";
import type { Stage } from "./review-workspace";
import {
  Action,
  Data,
  Row,
  View,
  api,
  formatDate,
  formatTime,
  outcomeMeta,
} from "./shared";

type Go = (v: View, id?: string | null, stage?: Stage) => void;

export function FindingTally({ item, revision }: { item: Row; revision?: number }) {
  const open = (item.findings || []).filter((f: Row) => !f.resolved);
  const t = (tone: string) => open.filter((f: Row) => outcomeMeta(f).tone === tone).length;
  const cells = [
    ["red", t("red")],
    ["orange", t("orange")],
    ["yellow", t("yellow") + t("blue")],
  ].filter(([, n]) => (n as number) > 0);
  if (!item.scan_hash) return <span className="muted small">Not checked</span>;
  if ((revision !== undefined && item.scan_revision !== revision) || item.status === "Needs reassessment")
    return <span className="tally tone-orange">Re-check needed</span>;
  if (!cells.length)
    return (
      <span className="tally tone-green">
        <CheckCircle2 size={13} /> Clean
      </span>
    );
  return (
    <span className="tally">
      {cells.map(([tone, n]) => (
        <span key={tone as string} className={"tally-dot tone-" + tone}>
          {n as number}
        </span>
      ))}
    </span>
  );
}

function QueueTable({
  items,
  data,
  onOpen,
  empty,
  extra,
}: {
  items: Row[];
  data: Data;
  onOpen: (id: string) => void;
  empty: React.ReactNode;
  extra?: (c: Row) => React.ReactNode;
}) {
  if (!items.length) return <div className="empty-mini">{empty}</div>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>CONTENT</th>
            <th>FINDINGS</th>
            <th>STATUS</th>
            <th>{extra ? "NEXT" : "UPDATED"}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const creative = data.creatives?.find((x) => x.content_id === c.id);
            return (
              <tr key={c.id} onClick={() => onOpen(c.id)}>
                <td>
                  <button className="row-link">
                    <span className="file-icon">
                      {creative ? <ImageIcon size={17} /> : <FileText size={17} />}
                    </span>
                    <span>
                      {c.title}
                      <small>
                        {c.channel} · {data.campaigns.find((p) => p.id === c.campaign_id)?.name} · v{c.version}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <FindingTally item={c} revision={data.workspace.revision} />
                </td>
                <td>
                  <span className={"status-pill s-" + c.status.toLowerCase().replace(/\s+/g, "-")}>{c.status}</span>
                </td>
                <td className="muted">{extra ? extra(c) : formatDate(c.updated)}</td>
                <td>
                  <ArrowRight size={15} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Home ---------- */
export function HomeDashboard({ data, go, crew }: { data: Data; go: Go; crew: React.ReactNode }) {
  const open = data.content.flatMap((c) => (c.findings || []).filter((f: Row) => !f.resolved).map((f: Row) => ({ ...f, c })));
  const awaitingDecision = open.filter((f) => !f.review);
  const toCorrect = open.filter((f) => ["critical", "gap", "visual"].includes(outcomeMeta(f).group) || f.review?.state === "Confirmed");
  const inReview = data.content.filter((c) => c.status === "In review");
  const reassess = data.content.filter((c) => c.status === "Needs reassessment");
  const ad = data.judge_demo ? data.content.find((c) => data.creatives?.some((x) => x.content_id === c.id && x.origin === "fixture")) : null;
  const adCreative = ad && data.creatives.find((x) => x.content_id === ad.id && x.origin === "fixture");
  const firstItem = (list: Row[]) => list[0]?.c?.id || list[0]?.id || null;
  const cards = [
    { icon: ScanLine, n: data.content.length, label: "Scan new content", note: "Upload an ad, image, PDF or copy", go: () => go("Scan & Detect"), cta: "Upload" },
    { icon: ClipboardCheck, n: awaitingDecision.length, label: "Pending human reviews", note: `Findings awaiting a reviewer decision across ${new Set(awaitingDecision.map((f) => f.c.id)).size} item(s)`, go: () => go("Verify & Review", firstItem(awaitingDecision)), cta: "Review" },
    { icon: Wand2, n: toCorrect.length, label: "Issues awaiting correction", note: "Contradictions, evidence gaps and visual violations", go: () => go("Fix & Approve", firstItem(toCorrect), "fix"), cta: "Fix" },
    { icon: ShieldCheck, n: inReview.length, label: "Awaiting approval", note: "Review requested by the author", go: () => go("Fix & Approve", inReview[0]?.id || null, "fix"), cta: "Approve" },
    { icon: GitBranch, n: reassess.length, label: "Changed facts to reassess", note: "Content linked to an updated approved record", go: () => go("Impact Monitor"), cta: "Reassess" },
    { icon: History, n: data.activity.length, label: "Recent audit activity", note: data.activity[0] ? `${data.activity[0].action} · ${data.activity[0].actor}` : "No activity yet", go: () => go("Trust & Audit"), cta: "Audit" },
  ];
  const setup = !data.sources.length;
  return (
    <>
      {ad && adCreative && (
        <section className="spotlight">
          <button className="spotlight-art" onClick={() => go("Scan & Detect", ad.id)} aria-label="Open the marked-up advertisement">
            <img src={adCreative.image_url} alt="Fictional Inkloom AI advertisement" />
            <span className="spotlight-badge">{(adCreative.findings || []).length} issues marked</span>
          </button>
          <div className="spotlight-copy">
            <span className="origin-tag demo">
              <FlaskConical size={13} /> START HERE · DEMO SAMPLE
            </span>
            <h2>
              {ad.status === "Approved"
                ? "This ad was corrected, re-checked and approved. The original keeps its marks."
                : `An employee submitted this ad. ${(adCreative.findings || []).length} things in it are wrong or unsupported.`}
            </h2>
            <p>
              Brandora checked it against Inkloom AI’s Company Hub. Each problem is marked on the ad with its evidence. Click a mark, decide as a reviewer, fix it, approve it.
            </p>
            <div className="spotlight-legend">
              <span className="tone-red"><i />2 contradictions + wrong logo</span>
              <span className="tone-orange"><i />2 evidence gaps</span>
              <span className="tone-yellow"><i />1 needs review</span>
            </div>
            <div className="fix-save">
              <button className="button primary" onClick={() => go("Scan & Detect", ad.id)}>
                Open the marked-up ad <ArrowRight size={16} />
              </button>
              <span className={"status-pill s-" + ad.status.toLowerCase().replace(/\s+/g, "-")}>Now: {ad.status} · v{ad.version}</span>
            </div>
          </div>
        </section>
      )}
      {setup && (
        <section className="spotlight setup">
          <div className="spotlight-copy">
            <span className="origin-tag rules">
              <BookOpen size={13} /> FIRST STEP
            </span>
            <h2>Tell Brandora what your company has approved.</h2>
            <p>Add pricing, claims, policies and your logo to Company Hub. Every check compares content against these records only.</p>
            <button className="button primary" onClick={() => go("Company Hub")}>
              Set up Company Hub <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
      <div className="section-title">
        <h2>Continue your work</h2>
        <p>Live counts from this workspace.</p>
      </div>
      <section className="work-grid">
        {cards.map((c) => (
          <button key={c.label} className="work-card" onClick={c.go}>
            <span className="work-icon">
              <c.icon size={18} />
            </span>
            <strong>{String(c.n).padStart(2, "0")}</strong>
            <b>{c.label}</b>
            <small>{c.note}</small>
            <span className="work-cta">
              {c.cta} <ArrowUpRight size={14} />
            </span>
          </button>
        ))}
      </section>
      {crew}
    </>
  );
}

/* ---------- Scan & Detect ---------- */
const PHASES_IMAGE = ["File validated", "Text read with OCR", "Logo compared with approved reference", "Claims compared with Company Hub", "Findings marked on the creative"];
const PHASES_DOC = ["File validated", "Text extracted", "Claims compared with Company Hub", "Findings marked on the text"];

export function ScanDetect({
  data,
  open,
  refresh,
  onSettings,
}: {
  data: Data;
  open: (id: string) => void;
  refresh: () => Promise<void>;
  onSettings: () => void;
}) {
  const [mode, setMode] = useState<"file" | "text">("file"),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [drag, setDrag] = useState(false),
    [logos, setLogos] = useState<Row[]>([]),
    [refs, setRefs] = useState<string[]>([]),
    [phase, setPhase] = useState<"idle" | "running" | "done" | "failed">("idle"),
    [error, setError] = useState(""),
    [result, setResult] = useState<Row | null>(null),
    [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const subject = data.rules[0]?.subject || data.workspace.name.replace(/ · Judge demo$/, "");
  const isImage = !!file && /\.(png|jpe?g|webp)$/i.test(file.name);
  const aiOn = !!data.workspace.settings.ai_enabled;
  const creator = ["manager", "creator", "partner"].includes(data.user.role);
  useEffect(() => {
    api("/logos")
      .then((l: Row[]) => {
        setLogos(l);
        setRefs(l.slice(0, 3).map((x) => x.id));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!file || !isImage) return setPreview("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);
  const choose = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPhase("idle");
    setError("");
    setResult(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 100));
  };
  const submitFile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;
    const form = new FormData(e.currentTarget);
    form.set("file", file);
    form.set("reference_ids", JSON.stringify(refs));
    setPhase("running");
    setError("");
    try {
      const item = await api("/scan/upload", "POST", form);
      setResult(item);
      setPhase("done");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
      setPhase("failed");
    }
  };
  const submitText = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setPhase("running");
    setError("");
    try {
      const created = await api("/content", "POST", values);
      const item = await api(`/content/${created.id}/scan`, "POST");
      setResult(item);
      setPhase("done");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
      setPhase("failed");
    }
  };
  const phases = mode === "file" && isImage ? PHASES_IMAGE : PHASES_DOC;
  const recent = [...data.content].sort((a, b) => (a.updated < b.updated ? 1 : -1)).slice(0, 6);
  const fields = (
    <>
      <div className="form-grid">
        <label className="field">
          <span>Title</span>
          <input name="title" required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring campaign banner" />
        </label>
        <label className="field">
          <span>Campaign</span>
          <select name="campaign_id">
            {data.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Product / subject</span>
          <input name="subject" required defaultValue={subject} />
        </label>
        <label className="field">
          <span>Channel</span>
          <select name="channel" defaultValue="Advertisement">
            {["Advertisement", "Social", "Website", "Email"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
  if (!creator)
    return (
      <section className="panel">
        <div className="empty-mini">
          <p>Reviewers inspect and decide on content. Creators, partners and managers upload it.</p>
        </div>
        <RecentScans recent={recent} data={data} open={open} />
      </section>
    );
  return (
    <div className="scan-grid">
      <section className="panel scan-panel">
        <div className="stage-tabs inline" role="tablist">
          <button role="tab" aria-selected={mode === "file"} className={mode === "file" ? "active" : ""} onClick={() => { setMode("file"); setPhase("idle"); }}>
            <Upload size={15} /> Upload a file
          </button>
          <button role="tab" aria-selected={mode === "text"} className={mode === "text" ? "active" : ""} onClick={() => { setMode("text"); setPhase("idle"); }}>
            <FileText size={15} /> Paste text
          </button>
        </div>
        {!data.campaigns.length ? (
          <div className="empty-mini">
            <p>Create a campaign in Company Hub before scanning content.</p>
          </div>
        ) : mode === "file" ? (
          <form onSubmit={submitFile} className="form">
            <div
              className={"dropzone" + (drag ? " drag" : "") + (file ? " has-file" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                choose(e.dataTransfer.files?.[0]);
              }}
              onClick={() => input.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            >
              <input ref={input} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.txt,.md" onChange={(e) => choose(e.target.files?.[0])} />
              {preview ? (
                <img src={preview} alt="Selected creative" />
              ) : file ? (
                <span className="drop-file">
                  <FileText size={28} />
                  {file.name}
                </span>
              ) : (
                <>
                  <Upload size={30} />
                  <b>Drop an ad, social creative, brochure or document</b>
                  <span>PNG, JPEG, WebP · PDF, DOCX, TXT, Markdown · up to 3 MB</span>
                </>
              )}
            </div>
            {isImage && !aiOn && (
              <div className="inline-warn">
                <AlertTriangle size={15} />
                <span>
                  Reading text from images uses AI, which is switched off in this workspace.
                  {data.user.role === "manager" ? " Enable it, or paste the text instead." : " Ask a manager to enable it, or paste the text instead."}
                </span>
                {data.user.role === "manager" && (
                  <button type="button" className="text-button" onClick={onSettings}>
                    Enable AI
                  </button>
                )}
                <button type="button" className="text-button" onClick={() => setMode("text")}>
                  Paste text
                </button>
              </div>
            )}
            {fields}
            {isImage && logos.length > 0 && (
              <fieldset className="logo-options compact">
                <legend>Compare with approved logos</legend>
                {logos.map((l) => (
                  <label key={l.id}>
                    <input
                      type="checkbox"
                      checked={refs.includes(l.id)}
                      disabled={!refs.includes(l.id) && refs.length >= 3}
                      onChange={(e) => setRefs(e.target.checked ? [...refs, l.id] : refs.filter((x) => x !== l.id))}
                    />
                    <img src={l.image_url} alt="" />
                    <span>{l.name}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <button className="button primary" disabled={!file || phase === "running" || (isImage && !aiOn)}>
              <ScanLine size={16} /> {phase === "running" ? "Scanning…" : "Scan for issues"}
            </button>
            <p className="form-note">
              Images are read by the configured AI provider and stored privately with this version for review and audit. Documents are read on the Brandora server.
            </p>
          </form>
        ) : (
          <form onSubmit={submitText} className="form">
            {fields}
            <input type="hidden" name="language" value="en" />
            <label className="field">
              <span>Content</span>
              <textarea name="body" rows={7} maxLength={5000} required placeholder="Paste the ad copy, post, email or page text…" />
            </label>
            <button className="button primary" disabled={phase === "running"}>
              <ScanLine size={16} /> {phase === "running" ? "Checking…" : "Check against Company Hub"}
            </button>
          </form>
        )}
      </section>
      <aside className="scan-side">
        <section className={"panel pipeline p-" + phase}>
          <div className="panel-header">
            <div>
              <h2>Processing</h2>
              <p>
                {phase === "idle" && "Steps run on the server when you scan."}
                {phase === "running" && "Running… this can take up to a minute for images."}
                {phase === "done" && "Review ready."}
                {phase === "failed" && "Processing failed. Nothing was marked as checked."}
              </p>
            </div>
            {phase === "running" && <Loader2 className="spin" size={18} />}
          </div>
          <ol className="pipeline-steps">
            <li className={phase !== "idle" ? "done" : ""}>
              {phase !== "idle" ? <Check size={13} /> : <span />}Uploaded
            </li>
            {phases.map((p) => (
              <li key={p} className={phase === "done" ? "done" : phase === "running" ? "running" : phase === "failed" ? "failed" : ""}>
                {phase === "done" ? <Check size={13} /> : phase === "failed" ? <XCircle size={13} /> : phase === "running" ? <Loader2 size={13} className="spin" /> : <span />}
                {p}
              </li>
            ))}
            <li className={phase === "done" ? "done ready" : phase === "failed" ? "failed" : ""}>
              {phase === "done" ? <CheckCircle2 size={13} /> : phase === "failed" ? <XCircle size={13} /> : <span />}
              {phase === "failed" ? "Processing failed" : "Review ready"}
            </li>
          </ol>
          {phase === "failed" && (
            <div className="pipeline-error">
              <p>{error}</p>
              {mode === "file" && (
                <button className="button small" onClick={() => { setMode("text"); setPhase("idle"); }}>
                  Review manually: paste the text
                </button>
              )}
            </div>
          )}
          {phase === "done" && result && (
            <div className="pipeline-result">
              <p>
                <b>{result.findings.length}</b> finding{result.findings.length === 1 ? "" : "s"} · {result.scan_coverage}
              </p>
              <button className="button primary" onClick={() => open(result.id)}>
                Open annotated review <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
        {data.judge_demo && (
          <section className="panel sample-files">
            <div className="panel-header">
              <div>
                <h2>Try your own upload</h2>
                <p>Download the sample ad, then upload it here with live AI to see findings generated from OCR instead of sample layout data.</p>
              </div>
            </div>
            <div className="sample-links">
              {[
                ["creative.png", "Wrong Inkloom AI ad"],
                ["logo.png", "Approved logo"],
                ["scanned-source.pdf", "Scanned pricing policy"],
              ].map(([f, label]) => (
                <a key={f} href={`/api/demo/assets/${f}`} download>
                  <Download size={13} /> {label}
                </a>
              ))}
            </div>
          </section>
        )}
        <RecentScans recent={recent} data={data} open={open} />
      </aside>
    </div>
  );
}
function RecentScans({ recent, data, open }: { recent: Row[]; data: Data; open: (id: string) => void }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Recent scans</h2>
          <p>Open any item to see its marks and evidence.</p>
        </div>
      </div>
      <div className="mini-list">
        {recent.map((c) => (
          <button key={c.id} onClick={() => open(c.id)}>
            <span className="file-icon">{data.creatives?.some((x) => x.content_id === c.id) ? <ImageIcon size={15} /> : <FileText size={15} />}</span>
            <span>
              <b>{c.title}</b>
              <small>
                {c.channel} · v{c.version} · {c.status}
              </small>
            </span>
            <FindingTally item={c} revision={data.workspace.revision} />
          </button>
        ))}
        {!recent.length && <p className="muted padded">Nothing scanned yet.</p>}
      </div>
    </section>
  );
}

/* ---------- Verify & Review ---------- */
export function VerifyQueue({ data, go, action }: { data: Data; go: Go; action: Action }) {
  const queue = data.content.filter(
    (c) => c.status === "In review" || (c.findings || []).some((f: Row) => !f.resolved && !f.review),
  );
  const reviewer = ["manager", "reviewer"].includes(data.user.role);
  const tasks = data.tasks;
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Review queue</h2>
            <p>Content with findings awaiting a human decision, or waiting for approval.</p>
          </div>
          <span className="status-chip tone-yellow">
            <i />
            {queue.length} in queue
          </span>
        </div>
        <QueueTable
          items={queue}
          data={data}
          onOpen={(id) => go("Verify & Review", id, "review")}
          empty={<p>Nothing waiting for a decision.</p>}
          extra={(c) => {
            const n = (c.findings || []).filter((f: Row) => !f.resolved && !f.review).length;
            return n ? `${n} decision${n === 1 ? "" : "s"} needed` : c.status === "In review" ? "Approval" : "—";
          }}
        />
        {!reviewer && <p className="form-note padded">Decisions are recorded by reviewers and managers{data.judge_demo ? ". Switch role in the demo bar." : "."}</p>}
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Evidence requests & escalations</h2>
            <p>Created from evidence gaps and reviewer decisions. Closing one never overrides an unsupported claim.</p>
          </div>
        </div>
        {tasks.length ? (
          <div className="task-list">
            {tasks.map((t) => (
              <div className="task-row" key={t.id}>
                <span className="task-icon">
                  <CircleHelp size={20} />
                </span>
                <div>
                  <h3>{t.title}</h3>
                  <p>
                    {data.content.find((c) => c.id === t.content_id)?.title} · Owner: {t.owner} · {formatDate(t.created)}
                  </p>
                </div>
                <span className={"status-chip tone-" + (t.status === "Open" ? "orange" : "grey")}>
                  <i />
                  {t.status}
                </span>
                <button className="button small" onClick={() => go("Verify & Review", t.content_id, "review")}>
                  Open <ArrowUpRight size={13} />
                </button>
                {reviewer && t.status === "Open" && (
                  <button
                    className="icon-button"
                    aria-label="Close resolved task"
                    onClick={() => action("/tasks/" + t.id + "/close", "POST", undefined, "Task closed")}
                  >
                    <Check size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-mini">
            <p>No evidence requests yet.</p>
          </div>
        )}
      </section>
    </>
  );
}

/* ---------- Fix & Approve ---------- */
export function FixQueue({ data, go, receipt }: { data: Data; go: Go; receipt: (a: Row) => void }) {
  const fix = data.content.filter((c) => (c.findings || []).some((f: Row) => !f.resolved) && c.status !== "In review");
  const approve = data.content.filter((c) => c.status === "In review");
  const ready = data.content.filter((c) => c.status === "Ready for review");
  const openFix = (id: string) => go("Fix & Approve", id, "fix");
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Needs correction</h2>
            <p>Apply approved values, rewrite unsupported claims, then re-check.</p>
          </div>
          <span className="status-chip tone-red">
            <i />
            {fix.length}
          </span>
        </div>
        <QueueTable items={fix} data={data} onOpen={openFix} empty={<p>No content needs correction.</p>} />
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Awaiting approval</h2>
            <p>Only an independent reviewer can approve. Approval binds to one exact version.</p>
          </div>
          <span className="status-chip tone-yellow">
            <i />
            {approve.length + ready.length}
          </span>
        </div>
        <QueueTable
          items={[...approve, ...ready]}
          data={data}
          onOpen={openFix}
          empty={<p>Nothing is waiting for approval.</p>}
          extra={(c) => (c.status === "In review" ? "Reviewer approval" : "Author requests review")}
        />
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Approved versions</h2>
            <p>Receipts preserve the content and evidence at the moment of approval.</p>
          </div>
        </div>
        {data.approvals.length ? (
          <div className="receipt-list">
            {data.approvals.map((a) => (
              <button className="receipt-row" key={a.id} onClick={() => receipt(a)}>
                <span className="receipt-icon">
                  <ShieldCheck size={22} />
                </span>
                <span>
                  <b>{a.snapshot.title}</b>
                  <small>
                    v{a.version} · {a.snapshot.reviewer} · {formatDate(a.created)}
                  </small>
                </span>
                <code>{String(a.content_hash).slice(0, 12)}</code>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-mini">
            <p>No approvals yet.</p>
          </div>
        )}
      </section>
    </>
  );
}

/* ---------- Impact Monitor ---------- */
function replaceValue(excerpt: string, from: string, to: string) {
  if (!/^\d+(\.\d+)?$/.test(from)) return excerpt.split(from).join(to);
  const re = new RegExp("(?<![\\d,.])" + from.split("").join(",?") + "(?![\\d])", "g");
  return excerpt.replace(re, (m) => {
    if (!m.includes(",") || !/^\d+$/.test(to)) return to;
    const head = to.slice(0, -3),
      tail = to.slice(-3);
    return head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + tail : tail;
  });
}
const FACT_EVENTS = ["Published source version", "Updated approved rule", "Approved rule", "Registered source"];

export function ImpactMonitor({
  data,
  go,
  action,
  receipt,
  notify,
}: {
  data: Data;
  go: Go;
  action: Action;
  receipt: (a: Row) => void;
  notify: (s: string) => void;
}) {
  const manager = data.user.role === "manager";
  const editable = data.rules.filter((r) => ["number", "term"].includes(r.kind));
  const [ruleId, setRuleId] = useState(editable.find((r) => r.config?.metric === "trial")?.id || editable[0]?.id || ""),
    [value, setValue] = useState(""),
    [excerpt, setExcerpt] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rule = data.rules.find((r) => r.id === ruleId);
  const source = data.sources.find((s) => s.id === rule?.source_id);
  useEffect(() => {
    setPreview(null);
    setError("");
    setValue("");
    setExcerpt(source?.excerpt || "");
  }, [ruleId]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeValue = (v: string) => {
    setValue(v);
    setPreview(null);
    if (rule && source) setExcerpt(v ? replaceValue(source.excerpt, rule.value, v) : source.excerpt);
  };
  const dryRun = async () => {
    setBusy(true);
    setError("");
    try {
      setPreview(await api("/impact", "POST", { rule_id: ruleId, value }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    if (!rule || !source) return;
    const s = await action(
      "/sources/" + source.id,
      "PUT",
      { title: source.title, owner: source.owner, excerpt, review_date: source.review_date || "", status: source.status },
      "New source version published",
    );
    if (!s) return;
    const r = await action(
      "/rules/" + rule.id,
      "PUT",
      { source_id: rule.source_id, code: rule.code, title: rule.title, kind: rule.kind, value, subject: rule.subject, config: rule.config },
      "Fact changed · linked content flagged for reassessment",
    );
    if (r) {
      notify(`${rule.title} is now ${value}. Previous version kept in history.`);
      setPreview(null);
      setValue("");
    }
  };
  const reassess = data.content.filter((c) => c.status === "Needs reassessment");
  const changes = data.activity.filter((a) => FACT_EVENTS.includes(a.action));
  const ownerName = (id: string) => data.members.find((m) => m.id === id)?.name || "Author";
  const wasApproved = (c: Row) => data.approvals.some((a) => a.content_id === c.id);
  return (
    <>
      <section className="stats impact-stats">
        {[
          { label: "Fact changes recorded", value: changes.length, note: "Versions are kept; nothing is overwritten" },
          { label: "Content to reassess", value: reassess.length, note: "Linked to a changed approved record" },
          { label: "Previously approved", value: reassess.filter(wasApproved).length, note: "High priority: may already be in use" },
          { label: "Open evidence tasks", value: data.tasks.filter((t) => t.status === "Open").length, note: "Owned by evidence owners" },
        ].map((s) => (
          <div className="stat" key={s.label}>
            <div>
              <span>{s.label}</span>
            </div>
            <strong>{String(s.value).padStart(2, "0")}</strong>
            <p>{s.note}</p>
          </div>
        ))}
      </section>
      <div className="impact-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Change an approved fact</h2>
              <p>Preview first. Publishing creates a new source version and flags every linked item.</p>
            </div>
          </div>
          {!editable.length ? (
            <div className="empty-mini">
              <p>Add facts in Company Hub first.</p>
            </div>
          ) : (
            <div className="form padded">
              <label className="field">
                <span>Approved fact</span>
                <select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
                  {editable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {r.title} (currently {r.value})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>New approved value</span>
                <input value={value} onChange={(e) => changeValue(e.target.value)} placeholder={rule?.config?.metric === "trial" ? "e.g. 7" : rule?.value} />
              </label>
              {value && (
                <label className="field">
                  <span>New source wording · {source?.title} v{(source?.version || 0) + 1}</span>
                  <textarea rows={4} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
                </label>
              )}
              <div className="fix-save">
                <button className="button" disabled={!value || busy} onClick={dryRun}>
                  <FlaskConical size={15} /> Preview impact
                </button>
                {manager ? (
                  <button className="button primary" disabled={!value || !preview || busy || excerpt === source?.excerpt} onClick={publish} title={!preview ? "Preview the impact first" : undefined}>
                    <GitBranch size={15} /> Publish change
                  </button>
                ) : (
                  <span className="form-note">Only managers publish fact changes{data.judge_demo ? " — switch to Manager in the demo bar" : ""}.</span>
                )}
              </div>
              {error && <p className="error">{error}</p>}
              {preview && (
                <div className="impact-preview">
                  <p>
                    <b>{preview.affected.length}</b> item{preview.affected.length === 1 ? "" : "s"} would be affected if {preview.rule} changes from {preview.from} to {preview.to}. Dry run — nothing has changed yet.
                  </p>
                  {preview.affected.map((c: Row) => (
                    <div key={c.id} className="impact-row">
                      <FileText size={15} />
                      <span>
                        <b>{c.title}</b>
                        <small>
                          {c.channel} · {c.status} · {c.before} → {c.after} findings
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Reassessment queue</h2>
              <p>Each item goes back to its author. Re-checking clears it or shows what to fix.</p>
            </div>
          </div>
          {reassess.length ? (
            <div className="task-list">
              {reassess.map((c) => (
                <div className="task-row" key={c.id}>
                  <span className={"priority " + (wasApproved(c) ? "high" : "medium")}>{wasApproved(c) ? "High" : "Medium"}</span>
                  <div>
                    <h3>{c.title}</h3>
                    <p>
                      {c.channel} · owner {ownerName(c.author_id)} · {wasApproved(c) ? "was approved" : "not yet approved"}
                    </p>
                  </div>
                  <button className="button small primary" onClick={() => go("Fix & Approve", c.id, "fix")}>
                    Reassess <ArrowRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-mini">
              <p>Nothing to reassess. Change a fact to see affected content appear here.</p>
            </div>
          )}
          <p className="form-note padded">
            Brandora does not track who saw published content. “Previously approved” means the content may already be in use, not that a customer read it.
          </p>
        </section>
      </div>
      <div className="impact-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Fact change log</h2>
              <p>Every change to approved information, with who made it.</p>
            </div>
          </div>
          <div className="activity-list padded">
            {changes.length ? (
              changes.map((a) => (
                <div className="activity-item" key={a.id}>
                  <span className="activity-dot">
                    <GitBranch size={12} />
                  </span>
                  <div>
                    <b>{a.action}</b>
                    <p>
                      {a.target}
                      {a.detail?.version ? ` · v${a.detail.version}` : ""}
                      {a.detail?.affected ? ` · ${a.detail.affected.length} item(s) flagged` : ""}
                    </p>
                    <small>
                      {a.actor} · {formatTime(a.created)}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No fact changes yet.</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>What was approved at the time?</h2>
              <p>Each receipt shows the content and the source versions it relied on when approved.</p>
            </div>
          </div>
          {data.approvals.length ? (
            <div className="receipt-list">
              {data.approvals.map((a) => (
                <button className="receipt-row" key={a.id} onClick={() => receipt(a)}>
                  <span className="receipt-icon">
                    <History size={20} />
                  </span>
                  <span>
                    <b>{a.snapshot.title}</b>
                    <small>
                      v{a.version} · {formatDate(a.created)} · {(a.snapshot.dependencies || []).map((d: Row) => `${d.source_title} v${d.source_version}`).join(", ") || "no linked sources"}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-mini">
              <p>No approvals yet.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/* ---------- Brand assets: approved logo register ---------- */
export function LogoRegister({ manager }: { manager: boolean }) {
  const [logos, setLogos] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [error, setError] = useState("");
  const load = () => api("/logos").then(setLogos).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Approved logos</h2>
          <p>Uploaded creatives are compared with these references. A visual match is similarity, not proof of authenticity.</p>
        </div>
      </div>
      <div className="logo-grid padded">
        {logos.map((l) => (
          <article key={l.id} className="logo-card">
            <img src={l.image_url} alt={l.name} />
            <b>{l.name}</b>
            <small>Registered {formatDate(l.created)}</small>
            {manager && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api(`/logos/${l.id}/withdraw`, "POST");
                    await load();
                    setMsg("Reference withdrawn.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Withdraw
              </button>
            )}
          </article>
        ))}
        {!logos.length && <p className="muted">No approved logo yet.</p>}
      </div>
      {manager && (
        <form
          className="form padded logo-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = e.currentTarget;
            try {
              await api("/logos", "POST", new FormData(form));
              form.reset();
              await load();
              setMsg("Approved logo registered.");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>Reference name</span>
              <input name="name" minLength={2} maxLength={100} required placeholder="Primary logo" />
            </label>
            <label className="field">
              <span>Logo image</span>
              <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
            </label>
          </div>
          <label className="checkbox-line">
            <input type="checkbox" required /> I confirm this is an approved brand reference.
          </label>
          <button className="button" disabled={busy}>
            <Upload size={15} /> Register logo
          </button>
        </form>
      )}
      {error && <p className="error padded">{error}</p>}
      {msg && <p className="form-note padded">{msg}</p>}
    </section>
  );
}
