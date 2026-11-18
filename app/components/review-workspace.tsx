"use client";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Download,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  History,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { TranslationPanel } from "./intelligence";
import {
  Action,
  Data,
  Modal,
  Row,
  Tone,
  api,
  contentCreative,
  download,
  formatDate,
  formatTime,
  orderedFindings,
  originalCreative,
  outcomeMeta,
  wordDiff,
} from "./shared";

export type Stage = "review" | "fix" | "compare" | "history";
type Filter = "all" | "critical" | "gap" | "review" | "visual" | "verified";
type Numbered = Row & { n: number };
type Rect = { y0: number; x0: number; y1: number; x1: number };

const TONE_RANK: Record<Tone, number> = {
  red: 5,
  orange: 4,
  yellow: 3,
  blue: 2,
  green: 1,
  grey: 0,
};
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["critical", "Critical"],
  ["gap", "Evidence gaps"],
  ["review", "Needs review"],
  ["visual", "Visual"],
  ["verified", "Verified"],
];
const passes = (f: Row, filter: Filter) => {
  if (filter === "all") return true;
  if (filter === "verified") return false;
  const g = outcomeMeta(f).group;
  return filter === "critical" ? g === "critical" || g === "visual" : g === filter;
};

/* Approximate glyph widths so character offsets map onto the region box more accurately. */
function charWeight(ch: string) {
  if (/[ilj.,:;'!|\s]/.test(ch)) return 0.42;
  if (/[ftr()\-]/.test(ch)) return 0.62;
  if (/[mwMW%]/.test(ch)) return 1.45;
  if (/[A-Z₹]/.test(ch)) return 1.18;
  return 1;
}
function offsetFraction(text: string, index: number) {
  let total = 0,
    before = 0;
  for (let i = 0; i < text.length; i++) {
    const w = charWeight(text[i]);
    if (i < index) before += w;
    total += w;
  }
  return total ? before / total : 0;
}
/* Character offsets inside one OCR region map onto its box, weighted by glyph width. */
function rectsFor(f: Row, creative: Row | null): Rect[] {
  if (!creative) return [];
  if (f.kind === "visual") {
    const [y0, x0, y1, x1] = f.box || [0, 0, 0, 0];
    return y1 > y0 && x1 > x0 ? [{ y0, x0, y1, x1 }] : [];
  }
  if (!f.span) return [];
  return (creative.regions || [])
    .filter((r: Row) => f.start < r.end && f.end > r.start)
    .map((r: Row) => {
      const len = Math.max(1, r.end - r.start),
        a = Math.max(f.start, r.start) - r.start,
        b = Math.min(f.end, r.end) - r.start;
      const [y0, x0, y1, x1] = r.box,
        w = x1 - x0,
        text = String(r.text || "").padEnd(len, " ");
      return {
        y0,
        y1,
        x0: Math.max(0, x0 + w * offsetFraction(text, a) - (a > 0 ? 8 : 0)),
        x1: Math.min(1000, x0 + w * offsetFraction(text, b) + (b < len ? 8 : 0)),
      };
    });
}

function foldQuotes(s: string) {
  return s.replace(/[‘’‛′]/g, "'").replace(/[“”„]/g, '"');
}
/* Locate the approved value inside an evidence excerpt so reviewers see the exact supporting words. */
function excerptMatch(f: Row): [number, number] | null {
  const ex = foldQuotes(f.evidence?.excerpt || "");
  const value = String(f.evidence?.rule_value || "");
  const tries: RegExp[] = [];
  if (/^\d+(\.\d+)?$/.test(value))
    tries.push(new RegExp(value.split("").join(",?") + "(?![\\d])"));
  if (f.span) tries.push(new RegExp(escape(foldQuotes(f.span)), "i"));
  if (value && !/^\d/.test(value)) tries.push(new RegExp(escape(value), "i"));
  for (const re of tries) {
    const m = re.exec(ex);
    if (m) return [m.index, m.index + m[0].length];
  }
  return null;
}
function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function sentenceAround(text: string, at: number) {
  const breaks = [...text.matchAll(/(?<!\bNo)[.!?](?=\s)/g)].map((m) => m.index!);
  let start = 0,
    end = text.length;
  for (const b of breaks) {
    if (b < at) start = b + 1;
    else {
      end = b + 1;
      break;
    }
  }
  const raw = text.slice(start, end);
  return [raw.trim(), start + raw.length - raw.trimStart().length] as const;
}
function Highlighted({ text, range }: { text: string; range: [number, number] | null }) {
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="ev-hit">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

function Chip({ f }: { f: Row }) {
  const meta = outcomeMeta(f);
  return (
    <span className={"status-chip tone-" + meta.tone}>
      <i />
      {meta.label}
    </span>
  );
}

/* ---------- Annotated content: image creative or text ---------- */
function CreativeCanvas({
  creative,
  findings,
  verified,
  selected,
  onSelect,
  show,
  filter,
  compact = false,
}: {
  creative: Row;
  findings: Numbered[];
  verified: Row[];
  selected: string | null;
  onSelect: (id: string) => void;
  show: boolean;
  filter: Filter;
  compact?: boolean;
}) {
  const visible = findings.filter((f) => passes(f, filter));
  const stacked: Record<string, number> = {};
  const greens = filter === "all" || filter === "verified" ? verified : [];
  const notFound = findings.find(
    (f) => f.kind === "visual" && !rectsFor(f, creative).length,
  );
  return (
    <div className={"canvas-wrap " + (compact ? "compact" : "")}>
      <div
        className="creative-canvas"
        style={{ aspectRatio: `${creative.width || 4} / ${creative.height || 3}` }}
      >
        <img src={creative.image_url} alt={creative.alt_text || "Submitted creative"} draggable={false} />
        {show &&
          greens.map((v) =>
            rectsFor(v, creative).map((r, k) => (
              <span
                key={v.id + k}
                className="anno-box tone-green verified-box"
                style={boxStyle(r)}
                title={`Verified · ${v.title} matches ${v.evidence?.title}`}
              />
            )),
          )}
        {show &&
          visible.map((f) => {
            const meta = outcomeMeta(f);
            return rectsFor(f, creative).map((r, k) => {
              const key = [r.y0, r.x0, r.y1, r.x1].map(Math.round).join(":");
              const stack = (stacked[key] = (stacked[key] ?? -1) + 1);
              const grown = { y0: r.y0 - stack * 9, x0: r.x0 - stack * 6, y1: r.y1 + stack * 9, x1: r.x1 + stack * 6 };
              return (
              <button
                key={f.id + k}
                className={
                  "anno-box tone-" +
                  meta.tone +
                  (selected === f.id ? " selected" : "") +
                  (meta.tone === "red" && !f.resolved ? " pulse" : "") +
                  (f.kind === "visual" ? " visual" : "")
                }
                style={{ ...boxStyle(grown), ["--stack" as string]: stack, zIndex: selected === f.id ? 3 : stack ? 1 : 2 }}
                onClick={() => onSelect(f.id)}
                aria-label={`Finding ${f.n}: ${meta.label}. ${f.title}`}
              >
                {k === 0 && (
                  <span className="anno-num" data-mark={f.id}>
                    {f.n}
                  </span>
                )}
                {k === 0 && (
                  <span className="anno-tip" role="tooltip">
                    <b>
                      {f.n}. {meta.label}
                    </b>
                    {f.title}
                  </span>
                )}
              </button>
              );
            });
          })}
      </div>
      {show && notFound && (
        <button
          className={"canvas-note tone-" + outcomeMeta(notFound).tone}
          onClick={() => onSelect(notFound.id)}
        >
          <span className="anno-num static" data-mark={notFound.id}>
            {notFound.n}
          </span>
          {notFound.title} — no location on the image.
        </button>
      )}
    </div>
  );
}
const boxStyle = (r: Rect) => ({
  top: r.y0 / 10 + "%",
  left: r.x0 / 10 + "%",
  width: (r.x1 - r.x0) / 10 + "%",
  height: (r.y1 - r.y0) / 10 + "%",
});

function AnnotatedText({
  body,
  findings,
  verified,
  selected,
  onSelect,
  show,
  filter,
}: {
  body: string;
  findings: Numbered[];
  verified: Row[];
  selected: string | null;
  onSelect: (id: string) => void;
  show: boolean;
  filter: Filter;
}) {
  const marks = show
    ? [
        ...findings
          .filter((f) => passes(f, filter) && f.span && f.end > f.start)
          .map((f) => ({ id: f.id, n: f.n, start: f.start, end: f.end, tone: outcomeMeta(f).tone })),
        ...(filter === "all" || filter === "verified"
          ? verified.map((v) => ({ id: v.id, n: 0, start: v.start, end: v.end, tone: "green" as Tone }))
          : []),
      ]
    : [];
  const cuts = Array.from(
    new Set([0, body.length, ...marks.flatMap((m) => [m.start, m.end])]),
  )
    .filter((x) => x >= 0 && x <= body.length)
    .sort((a, b) => a - b);
  const parts: React.ReactNode[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i],
      b = cuts[i + 1];
    const covering = marks.filter((m) => m.start <= a && m.end >= b);
    const text = body.slice(a, b);
    if (!covering.length) parts.push(<React.Fragment key={a}>{text}</React.Fragment>);
    else {
      const top = covering.sort((x, y) => TONE_RANK[y.tone] - TONE_RANK[x.tone])[0];
      const isSel = covering.some((m) => m.id === selected);
      parts.push(
        <mark
          key={a}
          className={"anno-text tone-" + top.tone + (isSel ? " selected" : "") + (top.n ? "" : " verified-text")}
          onClick={top.n ? () => onSelect((covering.find((m) => m.id === selected) || top).id) : undefined}
          title={top.n ? undefined : "Verified against an approved source"}
        >
          {text}
        </mark>,
      );
    }
    for (const m of marks.filter((m) => m.end === b && m.n))
      parts.push(
        <button
          key={"n" + m.id}
          className={"anno-num inline tone-" + m.tone + (selected === m.id ? " selected" : "")}
          data-mark={m.id}
          onClick={() => onSelect(m.id)}
          aria-label={"Finding " + m.n}
        >
          {m.n}
        </button>,
      );
  }
  const trailing = findings.filter(
    (f) => passes(f, filter) && show && f.kind !== "visual" && !f.span,
  );
  return (
    <div className="annotated-paper">
      <p className="annotated-body">{parts}</p>
      {trailing.map((f) => (
        <button
          key={f.id}
          className={"canvas-note tone-" + outcomeMeta(f).tone}
          onClick={() => onSelect(f.id)}
        >
          <span className="anno-num static" data-mark={f.id}>
            {f.n}
          </span>
          {f.title}
        </button>
      ))}
    </div>
  );
}

/* Thin connector between the selected mark and its explanation. */
function Connector({
  root,
  selected,
  tone,
  tick,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  selected: string | null;
  tone: Tone;
  tick: unknown;
}) {
  const [path, setPath] = useState<{ d: string; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      const el = root.current;
      if (!el || !selected || window.innerWidth < 1100) return setPath(null);
      const a = el.querySelector(`[data-mark="${selected}"]`),
        b = el.querySelector(`[data-card="${selected}"]`);
      if (!a || !b) return setPath(null);
      const R = el.getBoundingClientRect(),
        ra = a.getBoundingClientRect(),
        rb = b.getBoundingClientRect();
      const x1 = ra.right - R.left,
        y1 = ra.top + ra.height / 2 - R.top,
        x2 = rb.left - R.left,
        y2 = rb.top + 26 - R.top;
      if (x2 < x1 + 12 || rb.bottom < R.top || rb.top > window.innerHeight) return setPath(null);
      const mx = x1 + (x2 - x1) * 0.55;
      setPath({ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, x: x1, y: y1 });
    };
    update();
    const t = setTimeout(update, 420);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [root, selected, tick]);
  if (!path) return null;
  return (
    <svg className={"connector tone-" + tone} aria-hidden="true">
      <path d={path.d} />
      <circle cx={path.x} cy={path.y} r="3.5" />
    </svg>
  );
}

/* ---------- Finding card with evidence and reviewer decisions ---------- */
function FindingCard({
  f,
  open,
  onSelect,
  item,
  data,
  creative,
  logos,
  sourceDates,
  action,
  busy,
  onFix,
}: {
  f: Numbered;
  open: boolean;
  onSelect: () => void;
  item: Row;
  data: Data;
  creative: Row | null;
  logos: Row[];
  sourceDates: Record<string, string>;
  action: Action;
  busy: boolean;
  onFix: (id: string) => void;
}) {
  const meta = outcomeMeta(f);
  const [form, setForm] = useState<string | null>(null),
    [reason, setReason] = useState("");
  const isAuthor = [item.author_id, item.last_editor_id].includes(data.user.id),
    reviewerRole = ["manager", "reviewer"].includes(data.user.role),
    canDecide = reviewerRole && !isAuthor && !f.resolved,
    dismissible =
      f.outcome === "Low Confidence" &&
      !!f.evidence &&
      !["Source needs review", "Approved sources disagree"].includes(f.title),
    canEdit =
      data.user.role === "manager" ||
      (["creator", "partner"].includes(data.user.role) && item.author_id === data.user.id);
  const range = excerptMatch(f);
  const ex = foldQuotes(f.evidence?.excerpt || "");
  const [sentence, offset] = range ? sentenceAround(ex, range[0]) : ["", 0];
  const actions: [string, string, boolean, string][] = [
    ["confirm", "Confirm issue", canDecide, "Agree this needs correcting."],
    ["verify", "Mark as verified", canDecide && dismissible, "The content is acceptable here."],
    ["reject", "Reject finding", canDecide && dismissible, "The finding does not apply."],
    ["request_evidence", "Request evidence", canDecide && f.kind !== "visual", "Ask the evidence owner."],
    ["escalate", "Escalate", canDecide, "Send to compliance review."],
    ["comment", "Comment", true, "Add a note to the record."],
  ];
  const submit = async () => {
    const r = await action(
      `/content/${item.id}/findings/${f.id}/decision`,
      "POST",
      { action: form, reason },
      "Decision recorded in the audit trail",
    );
    if (r) {
      setForm(null);
      setReason("");
    }
  };
  const logo = logos.find((l) => l.id === f.evidence?.logo_reference_id);
  return (
    <article
      className={"finding-card tone-" + meta.tone + (open ? " open" : "")}
      data-card={f.id}
    >
      <button className="finding-head" onClick={onSelect} aria-expanded={open}>
        <span className={"anno-num static tone-" + meta.tone}>{f.n}</span>
        <span className="finding-head-text">
          <span className="finding-chips">
            <Chip f={f} />
            {f.review && !f.resolved && (
              <span className="review-chip">{f.review.state}</span>
            )}
            <code>{f.rule_code}</code>
          </span>
          <b>{f.title}</b>
          {f.span ? (
            <q>{f.span}</q>
          ) : f.kind === "visual" ? (
            <small>Logo area on the creative</small>
          ) : null}
        </span>
        <ChevronDown size={16} className="finding-caret" />
      </button>
      {open && (
        <div className="finding-body">
          <div className="evidence-compare">
            <div className="ev-side submitted">
              <small>SUBMITTED CONTENT</small>
              {f.kind === "visual" && creative ? (
                <LogoCrop creative={creative} box={f.box} />
              ) : (
                <p className={meta.group === "critical" ? "struck" : ""}>
                  {f.span || "—"}
                </p>
              )}
            </div>
            <div className="ev-side approved">
              <small>APPROVED COMPANY INFORMATION</small>
              {f.kind === "visual" ? (
                logo ? (
                  <img className="ev-logo" src={logo.image_url} alt={logo.name} />
                ) : (
                  <p>{f.evidence?.title}</p>
                )
              ) : meta.group === "gap" ? (
                <p className="ev-missing">No approved evidence supports this claim.</p>
              ) : sentence ? (
                <p>
                  <Highlighted
                    text={sentence}
                    range={range && [range[0] - offset, range[1] - offset]}
                  />
                </p>
              ) : (
                <p>{f.evidence ? `Approved value: ${f.evidence.rule_value}` : "No approved mapping yet."}</p>
              )}
            </div>
          </div>
          <p className="finding-why">{f.message}</p>
          {f.evidence ? (
            <details className="ev-source" open={meta.group !== "visual"}>
              <summary>
                <BookOpen size={14} />
                {f.evidence.title} · v{f.evidence.version}
                {sourceDates[f.evidence.source_id] &&
                  ` · recorded ${formatDate(sourceDates[f.evidence.source_id])}`}
              </summary>
              <blockquote>
                <Highlighted text={ex} range={range} />
              </blockquote>
              <span>
                Owner: {f.evidence.owner} · Source ID {String(f.evidence.source_id).slice(0, 10)}
              </span>
            </details>
          ) : (
            <p className="ev-missing small">
              No approved record is mapped to this claim. Brandora makes no factual verdict.
            </p>
          )}
          <dl className="finding-facts">
            <dt>Detected by</dt>
            <dd>{f.engine}</dd>
            <dt>Confidence</dt>
            <dd>{meta.confidence}</dd>
            <dt>Next step</dt>
            <dd>{meta.next}</dd>
          </dl>
          {f.suggestion && !f.resolved && (
            <div className="suggest-box">
              <small>SUGGESTED CORRECTION</small>
              <span>{f.suggestion}</span>
              {canEdit && (
                <button className="text-button" onClick={() => onFix(f.id)}>
                  Fix this <ArrowRight size={13} />
                </button>
              )}
            </div>
          )}
          {f.resolved && f.resolution && (
            <div className="suggest-box resolved">
              <small>REVIEWER RESOLUTION</small>
              <span>{f.resolution}</span>
            </div>
          )}
          <div className="decision-actions" role="group" aria-label="Reviewer actions">
            {actions.map(([key, label, enabled, hint]) => (
              <button
                key={key}
                className={"chip-button" + (form === key ? " active" : "")}
                disabled={!enabled || busy}
                title={enabled ? hint : disabledReason(key, { reviewerRole, isAuthor, dismissible, resolved: !!f.resolved })}
                onClick={() => setForm(form === key ? null : key)}
              >
                {key === "comment" ? <MessageSquare size={13} /> : key === "confirm" ? <Check size={13} /> : key === "escalate" ? <ShieldAlert size={13} /> : key === "request_evidence" ? <CircleHelp size={13} /> : <ShieldCheck size={13} />}
                {label}
              </button>
            ))}
          </div>
          {!reviewerRole && !f.resolved && (
            <p className="decision-note">
              Reviewers and managers record decisions{data.judge_demo ? " — switch to Reviewer in the demo bar to try it" : ""}.
            </p>
          )}
          {reviewerRole && isAuthor && !f.resolved && (
            <p className="decision-note">
              You authored or last edited this version. Another reviewer must decide.
            </p>
          )}
          {reviewerRole && !isAuthor && !dismissible && !f.resolved && (
            <p className="decision-note">
              {meta.group === "review"
                ? "No approved record is mapped yet, so this cannot be dismissed. Map it in Company Hub or remove it."
                : "This comes from an approved record, so it cannot be dismissed. Fix the content, or update the record in Company Hub."}
            </p>
          )}
          {form && (
            <div className="decision-form">
              <label>
                <span>
                  {form === "comment" ? "Your note" : "Reason (kept in the audit trail)"}
                </span>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    form === "verify" || form === "reject"
                      ? "Which evidence did you check, and why does this not need a change?"
                      : "Add the context a teammate needs."
                  }
                />
              </label>
              <div>
                <button className="button small" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button
                  className="button small primary"
                  disabled={busy || reason.trim().length < (form === "verify" || form === "reject" ? 10 : 3)}
                  onClick={submit}
                >
                  Record decision
                </button>
              </div>
            </div>
          )}
          {(f.review_log || []).length > 0 && (
            <ol className="decision-log">
              {f.review_log.map((d: Row, i: number) => (
                <li key={i}>
                  <b>{d.by}</b> <span>({d.role})</span> · {labelFor(d.action)} · {formatTime(d.at)}
                  <p>{d.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}
const labelFor = (a: string) =>
  ({
    confirm: "confirmed the issue",
    verify: "marked it verified",
    reject: "rejected the finding",
    request_evidence: "requested evidence",
    escalate: "escalated it",
    comment: "commented",
  })[a] || a;
function disabledReason(
  key: string,
  s: { reviewerRole: boolean; isAuthor: boolean; dismissible: boolean; resolved: boolean },
) {
  if (s.resolved) return "Already resolved.";
  if (!s.reviewerRole) return "Only reviewers and managers record decisions.";
  if (s.isAuthor) return "Authors cannot decide on their own content.";
  if ((key === "verify" || key === "reject") && !s.dismissible)
    return "Findings backed by approved records cannot be dismissed. Fix the content or the record.";
  return "Unavailable";
}

function LogoCrop({ creative, box }: { creative: Row; box: number[] }) {
  const [y0, x0, y1, x1] = box || [0, 0, 0, 0];
  if (!(y1 > y0 && x1 > x0)) return <p>Not located on the image.</p>;
  const w = (x1 - x0) / 1000,
    h = (y1 - y0) / 1000;
  return (
    <div
      className="logo-crop"
      style={{
        aspectRatio: `${(w * (creative.width || 4)) / (h * (creative.height || 3))}`,
        backgroundImage: `url(${creative.image_url})`,
        backgroundSize: `${100 / w}% ${100 / h}%`,
        backgroundPosition: `${(x0 / 1000 / (1 - w || 1)) * 100}% ${(y0 / 1000 / (1 - h || 1)) * 100}%`,
      }}
      role="img"
      aria-label="Submitted logo area"
    />
  );
}

/* ---------- Corrected creative preview (never presented as an edited image) ---------- */
function splitLines(text: string) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z₹0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function AdPreview({
  text,
  logo,
  status,
  verified = [],
  workspace,
}: {
  text: string;
  logo?: Row;
  status: string;
  verified?: Row[];
  workspace: string;
}) {
  const lines = splitLines(text);
  let cursor = 0;
  const render = (line: string) => {
    const at = text.indexOf(line, cursor);
    cursor = at + line.length;
    const hits = verified.filter((v) => v.start >= at && v.end <= at + line.length);
    if (!hits.length) return line;
    const out: React.ReactNode[] = [];
    let i = at;
    hits.sort((a, b) => a.start - b.start).forEach((v) => {
      out.push(text.slice(i, v.start));
      out.push(
        <mark key={v.id} className="anno-text tone-green verified-text" title={"Verified · " + v.evidence?.title}>
          {text.slice(v.start, v.end)}
        </mark>,
      );
      i = v.end;
    });
    out.push(text.slice(i, at + line.length));
    return out;
  };
  const cta = lines.length > 1 && !/[.!?]$/.test(lines[lines.length - 1]) && lines[lines.length - 1].split(" ").length <= 5;
  const approved = status === "Approved";
  return (
    <div className={"ad-preview" + (approved ? " approved" : "")}>
      <span className={"ad-ribbon" + (approved ? " ok" : "")}>
        {approved ? "Approved version" : "Draft · awaiting human approval"}
      </span>
      <div className="ad-logo">
        {logo ? <img src={logo.image_url} alt={logo.name} /> : <b>{workspace}</b>}
      </div>
      {lines.map((line, i) =>
        i === 0 ? (
          <h3 key={i}>{render(line)}</h3>
        ) : cta && i === lines.length - 1 ? (
          <span key={i} className="ad-cta">
            {render(line)}
          </span>
        ) : (
          <p key={i}>{render(line)}</p>
        ),
      )}
      <small className="ad-note">
        Text-and-layout preview with the approved logo. The original image file is not edited.
      </small>
    </div>
  );
}

function DiffView({ before, after, side }: { before: string; after: string; side: "before" | "after" }) {
  const parts = wordDiff(before, after);
  return (
    <p className="annotated-body diff">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ) : p.type === "del" ? (
          side === "before" ? <del key={i}>{p.text}</del> : null
        ) : side === "after" ? (
          <ins key={i}>{p.text}</ins>
        ) : null,
      )}
    </p>
  );
}

/* ---------- The workspace ---------- */
export function ReviewWorkspace({
  item,
  data,
  busy,
  action,
  back,
  backLabel,
  receipt,
  notify,
  setModal,
  initialStage = "review",
  onSettings,
}: {
  item: Row;
  data: Data;
  busy: boolean;
  action: Action;
  back: () => void;
  backLabel: string;
  receipt: (r: Row) => void;
  notify: (s: string) => void;
  setModal: (m: Modal) => void;
  initialStage?: Stage;
  onSettings: () => void;
}) {
  const creative = contentCreative(data, item);
  const original = originalCreative(data, item);
  const numbered: Numbered[] = useMemo(
    () => orderedFindings(item, creative).map((f, i) => ({ ...f, n: i + 1 })),
    [item, creative],
  );
  const verified: Row[] = item.verified || [];
  const [stage, setStage] = useState<Stage>(initialStage),
    [filter, setFilter] = useState<Filter>("all"),
    [show, setShow] = useState(true),
    [selected, setSelected] = useState<string | null>(
      numbered.find((f) => !f.resolved)?.id || numbered[0]?.id || null,
    ),
    [focusFix, setFocusFix] = useState<string | null>(null),
    [logos, setLogos] = useState<Row[]>([]),
    [sourceDates, setSourceDates] = useState<Record<string, string>>({}),
    [rereading, setRereading] = useState(false),
    [rereadError, setRereadError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected || !numbered.some((f) => f.id === selected))
      setSelected(numbered.find((f) => !f.resolved)?.id || null);
  }, [numbered]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api("/logos").then(setLogos).catch(() => setLogos([]));
  }, [data.workspace.revision]);
  useEffect(() => {
    const ids = Array.from(
      new Set(
        numbered
          .map((f) => f.evidence?.source_id)
          .filter((id) => id && !String(id).startsWith("logo:") && !sourceDates[id]),
      ),
    ) as string[];
    ids.forEach((id) =>
      api(`/sources/${id}/history`)
        .then((versions: Row[]) => {
          const version = numbered.find((f) => f.evidence?.source_id === id)?.evidence?.version;
          const hit = versions.find((v) => v.version === version) || versions[versions.length - 1];
          if (hit) setSourceDates((d) => ({ ...d, [id]: hit.created }));
        })
        .catch(() => {}),
    );
  }, [numbered]); // eslint-disable-line react-hooks/exhaustive-deps
  const select = useCallback((id: string) => {
    setSelected(id);
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-card="${id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }, []);
  const unresolved = numbered.filter((f) => !f.resolved);
  const awaiting = unresolved.filter((f) => !f.review);
  // A check is current only for this exact text and the latest Company Hub revision.
  const stale = !item.scan_hash || item.scan_revision !== data.workspace.revision || item.status === "Draft";
  const canEdit =
    data.user.role === "manager" ||
    (["creator", "partner"].includes(data.user.role) && item.author_id === data.user.id);
  const counts = {
    red: numbered.filter((f) => outcomeMeta(f).tone === "red").length,
    orange: numbered.filter((f) => outcomeMeta(f).tone === "orange").length,
    yellow: numbered.filter((f) => ["yellow", "blue"].includes(outcomeMeta(f).tone)).length,
    green: verified.length,
  };
  const steps = [
    { label: "Detect", note: stale ? (item.scan_hash ? "Re-check needed" : "Not checked") : `${numbered.length} finding${numbered.length === 1 ? "" : "s"}`, done: !stale },
    { label: "Review", note: awaiting.length ? `${awaiting.length} awaiting decision` : "Decisions recorded", done: !stale && !awaiting.length },
    { label: "Fix", note: unresolved.length ? `${unresolved.length} to correct` : "Nothing to correct", done: !stale && !unresolved.length },
    { label: "Approve", note: item.status === "Approved" ? "Approved" : item.status === "In review" ? "In review" : "Not yet", done: item.status === "Approved" },
  ];
  const current = steps.findIndex((s) => !s.done);
  const selectedFinding = numbered.find((f) => f.id === selected);
  const reread = async () => {
    if (!creative) return;
    setRereadError("");
    if (!data.workspace.settings.ai_enabled) {
      setRereadError("Live AI is off. A manager can enable it in Trust & Audit → Privacy & AI.");
      return;
    }
    setRereading(true);
    const form = new FormData();
    form.append("expected_version", String(item.version));
    form.append("reuse", creative.id);
    form.append("reference_ids", JSON.stringify(logos.slice(0, 3).map((l) => l.id)));
    const r = await action(`/content/${item.id}/creative`, "POST", form, "Image re-read with live AI · new version created");
    setRereading(false);
    if (r) setStage("review");
  };
  const campaign = data.campaigns.find((c) => c.id === item.campaign_id)?.name;
  return (
    <div className="review-ws">
      <div className="ws-top">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={15} />
          {backLabel}
        </button>
        <div className="ws-title">
          <h2>{item.title}</h2>
          <span>
            {item.channel} · {campaign} · version {item.version}
          </span>
        </div>
        <span className={"status-pill s-" + item.status.toLowerCase().replace(/\s+/g, "-")}>
          {item.status}
        </span>
      </div>
      <div className="ws-origin">
        {creative?.origin === "fixture" || (!creative && original?.origin === "fixture") ? (
          <>
            <span className="origin-tag demo">
              <FlaskConical size={13} />
              DEMO SAMPLE · fictional employee-uploaded content
            </span>
            <span>
              Text findings come from the live rule engine against Company Hub. Text positions and the logo finding are predefined sample data.
            </span>
          </>
        ) : creative ? (
          <>
            <span className="origin-tag ai">
              <Sparkles size={13} />
              Analysed with {creative.provider}
            </span>
            <span>OCR text and logo comparison are AI outputs. A reviewer must confirm them.</span>
          </>
        ) : (
          <>
            <span className="origin-tag rules">
              <FileText size={13} />
              Text content
            </span>
            <span>{item.scan_coverage}</span>
          </>
        )}
        {creative && canEdit && (
          <button className="button small" disabled={busy || rereading} onClick={reread}>
            {rereading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {creative.origin === "fixture" ? "Re-read with live AI" : "Re-read image"}
          </button>
        )}
      </div>
      {rereadError && (
        <div className="inline-warn">
          <AlertTriangle size={15} />
          {rereadError}
          {data.user.role === "manager" && (
            <button className="text-button" onClick={onSettings}>
              Open settings <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}
      <ol className="stepper" aria-label="Review progress">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? "done" : i === current ? "current" : ""}>
            <span>{s.done ? <Check size={13} /> : i + 1}</span>
            <div>
              <b>{s.label}</b>
              <small>{s.note}</small>
            </div>
          </li>
        ))}
      </ol>
      <div className="stage-tabs" role="tablist">
        {(
          [
            ["review", "Detect & review", ShieldCheck],
            ["fix", "Fix & approve", Wand2],
            ["compare", "Original vs corrected", Eye],
            ["history", "History & audit", History],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={stage === key}
            className={stage === key ? "active" : ""}
            onClick={() => setStage(key)}
          >
            <Icon size={15} />
            {label}
            {key === "review" && awaiting.length > 0 && <b>{awaiting.length}</b>}
            {key === "fix" && unresolved.length > 0 && <b>{unresolved.length}</b>}
          </button>
        ))}
      </div>

      {stage === "review" && (
        <>
          <div className="anno-toolbar">
            <div className="filter-row" role="group" aria-label="Filter annotations">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? "active" : ""}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span>
                    {key === "all"
                      ? numbered.length
                      : key === "verified"
                        ? verified.length
                        : numbered.filter((f) => passes(f, key)).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="anno-actions">
              <button className="button small" onClick={() => setShow(!show)}>
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
                {show ? "Hide annotations" : "Show annotations"}
              </button>
              <button className="button small" onClick={() => downloadReport(item, data, numbered, creative)}>
                <Download size={14} />
                Download report
              </button>
            </div>
          </div>
          <div className="review-grid" ref={root}>
            <section className="annotated-panel">
              {creative ? (
                <CreativeCanvas
                  creative={creative}
                  findings={numbered}
                  verified={verified}
                  selected={selected}
                  onSelect={select}
                  show={show}
                  filter={filter}
                />
              ) : (
                <AnnotatedText
                  body={item.body}
                  findings={numbered}
                  verified={verified}
                  selected={selected}
                  onSelect={select}
                  show={show}
                  filter={filter}
                />
              )}
              <div className="legend">
                <span className="tone-red"><i />Confirmed contradiction / visual violation · {counts.red}</span>
                <span className="tone-orange"><i />Evidence gap · {counts.orange}</span>
                <span className="tone-yellow"><i />Needs human review · {counts.yellow}</span>
                <span className="tone-green"><i />Verified · {counts.green}</span>
              </div>
              {creative && (
                <details className="ocr-details">
                  <summary>
                    <ImageIcon size={14} />
                    Text read from the creative
                  </summary>
                  <p>{item.body}</p>
                  {(creative.warnings || []).map((w: string, i: number) => (
                    <p key={i} className="form-note">
                      <AlertTriangle size={12} /> {w}
                    </p>
                  ))}
                </details>
              )}
              {!creative && original && (
                <p className="form-note">
                  The original creative (v{original.version}) stays attached with its markings in “Original vs corrected”.
                </p>
              )}
            </section>
            <aside className="findings-column">
              <div className="findings-head">
                <h3>
                  {stale
                    ? item.scan_hash
                      ? "Check is out of date"
                      : "Not checked yet"
                    : numbered.length
                      ? `${numbered.length} finding${numbered.length === 1 ? "" : "s"}`
                      : "No issues found"}
                </h3>
                <span>{item.scan_coverage}</span>
              </div>
              {stale && (
                <div className={"empty-mini" + (item.scan_hash ? " stale" : "")}>
                  <p>
                    {item.status === "Needs reassessment"
                      ? "An approved fact this content relies on has changed. Re-check it against the current Company Hub."
                      : item.scan_hash
                        ? "Company Hub or this text changed since the last check. Re-check before review."
                        : "This version has not been checked against Company Hub."}
                  </p>
                  <button
                    className="button small primary"
                    disabled={busy}
                    onClick={() => action(`/content/${item.id}/scan`, "POST", undefined, "Check complete")}
                  >
                    {item.scan_hash ? "Re-check now" : "Run check"}
                  </button>
                </div>
              )}
              {!stale && !numbered.length && (
                <div className="empty-mini ok">
                  <CheckCircle2 size={22} />
                  <p>
                    No issues in the checked rules{verified.length ? `, and ${verified.length} value${verified.length === 1 ? "" : "s"} verified against approved sources` : ""}. Human approval is still required.
                  </p>
                  <button className="button small primary" onClick={() => setStage("fix")}>
                    Go to approval <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {numbered
                .filter((f) => passes(f, filter === "verified" ? "all" : filter))
                .map((f) => (
                  <FindingCard
                    key={f.id}
                    f={f}
                    open={selected === f.id}
                    onSelect={() => setSelected(selected === f.id ? null : f.id)}
                    item={item}
                    data={data}
                    creative={creative}
                    logos={logos}
                    sourceDates={sourceDates}
                    action={action}
                    busy={busy}
                    onFix={(id) => {
                      setFocusFix(id);
                      setStage("fix");
                    }}
                  />
                ))}
              {(filter === "all" || filter === "verified") && verified.length > 0 && (
                <div className="verified-list">
                  <small>VERIFIED AGAINST COMPANY HUB</small>
                  {verified.map((v) => (
                    <div key={v.id}>
                      <CheckCircle2 size={14} />
                      <q>{v.span}</q>
                      <span>
                        {v.title} · {v.evidence?.title} v{v.evidence?.version}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {unresolved.length > 0 && canEdit && (
                <button className="button primary full" onClick={() => setStage("fix")}>
                  <Wand2 size={15} />
                  Fix {unresolved.length} issue{unresolved.length === 1 ? "" : "s"}
                </button>
              )}
            </aside>
            <Connector
              root={root}
              selected={show ? selected : null}
              tone={selectedFinding ? outcomeMeta(selectedFinding).tone : "red"}
              tick={`${filter}:${stage}:${numbered.length}:${selectedFinding?.review_log?.length || 0}`}
            />
          </div>
        </>
      )}

      {stage === "fix" && (
        <FixStage
          key={item.id + ":" + item.version}
          item={item}
          data={data}
          numbered={numbered}
          creative={creative}
          original={original}
          logos={logos}
          busy={busy}
          action={action}
          notify={notify}
          receipt={receipt}
          focus={focusFix}
          canEdit={canEdit}
          onCompare={() => setStage("compare")}
          onSettings={onSettings}
        />
      )}
      {stage === "compare" && (
        <CompareStage item={item} data={data} original={original} logos={logos} onFix={() => setStage("fix")} />
      )}
      {stage === "history" && (
        <HistoryStage item={item} data={data} receipt={receipt} setModal={setModal} action={action} back={back} />
      )}
    </div>
  );
}

/* ---------- Fix & approve ---------- */
function FixStage({
  item,
  data,
  numbered,
  creative,
  original,
  logos,
  busy,
  action,
  notify,
  receipt,
  focus,
  canEdit,
  onCompare,
  onSettings,
}: {
  item: Row;
  data: Data;
  numbered: Numbered[];
  creative: Row | null;
  original: Row | null;
  logos: Row[];
  busy: boolean;
  action: Action;
  notify: (s: string) => void;
  receipt: (r: Row) => void;
  focus: string | null;
  canEdit: boolean;
  onCompare: () => void;
  onSettings: () => void;
}) {
  const [draft, setDraft] = useState<string>(item.body),
    [edits, setEdits] = useState<Record<string, string>>({}),
    [done, setDone] = useState<Record<string, "applied" | "skipped">>({}),
    [celebrate, setCelebrate] = useState(false);
  const fixable = numbered.filter((f) => !f.resolved);
  const dirty = draft !== item.body;
  const isAuthor = [item.author_id, item.last_editor_id].includes(data.user.id),
    canApprove = ["manager", "reviewer"].includes(data.user.role) && !isAuthor;
  const tidy = (s: string) =>
    s
      .replace(/\s+([.,!?])/g, "$1")
      .replace(/([.!?])\s*\1+/g, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s*[.,]\s*/, "")
      .trim();
  const applyOne = (text: string, f: Row, replacement: string) => {
    if (!f.span || !text.includes(f.span)) return null;
    return tidy(text.replace(f.span, replacement));
  };
  const coveredBySibling = (f: Row) =>
    fixable.some((g) => g.id !== f.id && g.span === f.span && done[g.id] === "applied");
  const apply = (f: Row, replacement: string) => {
    const next = applyOne(draft, f, replacement);
    if (next === null) {
      if (coveredBySibling(f)) setDone((d) => ({ ...d, [f.id]: "applied" }));
      else notify("That text already changed. Save and re-check to refresh the findings.");
      return;
    }
    setDraft(next);
    setDone((d) => ({ ...d, [f.id]: "applied" }));
  };
  const applyAll = () => {
    let text = draft;
    const applied: Record<string, "applied"> = {};
    const spans = new Set<string>();
    const fix = (f: Row) => edits[f.id] ?? f.suggestion ?? "";
    // When two findings share a span, the fuller suggestion (e.g. corrected price + qualifier) goes first.
    const order = [...fixable].sort((a, b) => (a.span === b.span ? fix(b).length - fix(a).length : 0));
    for (const f of order) {
      const replacement = fix(f);
      if (!replacement || done[f.id]) continue;
      const next = applyOne(text, f, replacement);
      if (next !== null) {
        text = next;
        applied[f.id] = "applied";
        spans.add(f.span);
      } else if (spans.has(f.span)) applied[f.id] = "applied";
    }
    setDraft(text);
    setDone((d) => ({ ...d, ...applied }));
    notify(`${Object.keys(applied).length} suggested fix${Object.keys(applied).length === 1 ? "" : "es"} applied to the draft`);
  };
  const saveAndCheck = async () => {
    const saved = await action(
      `/content/${item.id}`,
      "PUT",
      { body: draft, title: item.title, expected_version: item.version },
      "Corrected version saved",
    );
    if (saved) await action(`/content/${item.id}/scan`, "POST", undefined, "Corrected version re-checked");
  };
  const uploadRevision = async (file: File) => {
    if (!data.workspace.settings.ai_enabled) {
      notify("Live AI is off. A manager can enable it in Trust & Audit.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("expected_version", String(item.version));
    form.append("reference_ids", JSON.stringify(logos.slice(0, 3).map((l) => l.id)));
    await action(`/content/${item.id}/creative`, "POST", form, "Revised creative uploaded and checked");
  };
  const approvals = data.approvals.filter((a) => a.content_id === item.id);
  const latest = approvals[0];
  const scanned = !!item.scan_hash && item.scan_revision === data.workspace.revision && !["Draft", "Needs reassessment"].includes(item.status);
  const allResolved = numbered.every((f) => f.resolved);
  const checks = [
    { ok: scanned, label: "Current version checked against Company Hub" },
    { ok: scanned && allResolved, label: allResolved ? "Every finding fixed or resolved" : `${numbered.filter((f) => !f.resolved).length} finding(s) still open` },
    { ok: ["In review", "Approved"].includes(item.status), label: "Review requested by the author" },
    { ok: item.status === "Approved" || canApprove, label: "Independent reviewer (not the author or last editor)" },
  ];
  const fromCreative = !!(creative || original);
  return (
    <div className="fix-grid">
      <section className="panel fix-list">
        <div className="panel-header">
          <div>
            <h2>Corrections</h2>
            <p>Accept, edit or skip each suggestion. Nothing is approved automatically.</p>
          </div>
          {canEdit && fixable.some((f) => f.suggestion && !done[f.id]) && (
            <button className="button small primary" onClick={applyAll}>
              <Wand2 size={14} /> Apply all suggestions
            </button>
          )}
        </div>
        {!fixable.length && (
          <div className="empty-mini ok">
            <CheckCircle2 size={22} />
            <p>No open findings on this version.</p>
          </div>
        )}
        {fixable.map((f) => {
          const meta = outcomeMeta(f);
          const replacement = edits[f.id] ?? f.suggestion ?? "";
          return (
            <div key={f.id} className={"fix-row tone-" + meta.tone + (focus === f.id ? " focus" : "") + (done[f.id] ? " is-done" : "")}>
              <span className={"anno-num static tone-" + meta.tone}>{f.n}</span>
              <div>
                <div className="fix-row-top">
                  <Chip f={f} />
                  <b>{f.title}</b>
                </div>
                {f.kind === "visual" ? (
                  <>
                    <p className="fix-explain">Brandora does not edit images. Replace the logo with the approved reference in your design tool, then upload the revised creative to re-check it.</p>
                    {canEdit && (
                      <label className="button small upload-inline">
                        <Upload size={14} /> Upload revised creative
                        <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && uploadRevision(e.target.files[0])} />
                      </label>
                    )}
                    {!data.workspace.settings.ai_enabled && (
                      <p className="form-note">
                        Reading a revised image needs live AI.{" "}
                        {data.user.role === "manager" && (
                          <button className="text-button" onClick={onSettings}>Enable it</button>
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="fix-change">
                      <del>{f.span}</del>
                      <ArrowRight size={14} />
                      <input
                        aria-label={"Correction for finding " + f.n}
                        value={replacement}
                        placeholder={meta.group === "gap" ? "Rewrite with an approved claim, or leave empty to remove" : "Your correction"}
                        disabled={!canEdit || !!done[f.id]}
                        onChange={(e) => setEdits({ ...edits, [f.id]: e.target.value })}
                      />
                    </div>
                    <p className="fix-explain">
                      {meta.group === "gap"
                        ? "The suggested rewrite uses a claim from the Approved claims register."
                        : meta.group === "critical"
                          ? `Uses the approved value from ${f.evidence?.title} v${f.evidence?.version}.`
                          : "Optional. A reviewer can also resolve this with a recorded reason."}
                    </p>
                    {canEdit && (
                      <div className="fix-actions">
                        {done[f.id] ? (
                          <span className="fix-state">
                            <Check size={13} /> {done[f.id] === "applied" ? "Applied to draft" : "Skipped"}
                          </span>
                        ) : (
                          <>
                            <button className="button small primary" onClick={() => apply(f, replacement)} disabled={!replacement && meta.group !== "gap"}>
                              {replacement ? "Accept" : "Remove claim"}
                            </button>
                            <button className="button small" onClick={() => setDone({ ...done, [f.id]: "skipped" })}>
                              Skip
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>
      <section className="panel fix-draft">
        <div className="panel-header">
          <div>
            <h2>Corrected draft</h2>
            <p>{dirty ? "Unsaved changes · save to create a new version and re-check it" : `Version ${item.version} · ${item.status}`}</p>
          </div>
          <button className="text-button" onClick={onCompare}>
            Compare <ArrowUpRight size={13} />
          </button>
        </div>
        <div className="fix-draft-body">
          {fromCreative ? (
            <AdPreview text={draft} logo={logos[0]} status={dirty ? "Draft" : item.status} verified={dirty ? [] : item.verified} workspace={data.workspace.name} />
          ) : (
            <div className="annotated-paper">
              <DiffView before={item.body} after={draft} side="after" />
            </div>
          )}
          <label className="field">
            <span>Edit the text directly</span>
            <textarea rows={5} value={draft} maxLength={5000} disabled={!canEdit} onChange={(e) => setDraft(e.target.value)} />
          </label>
          {canEdit && (
            <div className="fix-save">
              <button className="button primary" disabled={busy || !dirty || !draft.trim()} onClick={saveAndCheck}>
                <ShieldCheck size={15} /> Save corrected version & re-check
              </button>
              {dirty && (
                <button className="button" onClick={() => { setDraft(item.body); setDone({}); }}>
                  Discard
                </button>
              )}
            </div>
          )}
          {!canEdit && <p className="form-note">Only the author or a manager edits this draft. Reviewers decide on findings and approval.</p>}
        </div>
        <div className="approval-box">
          <h3>Approval</h3>
          <ul className="checklist">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? "ok" : ""}>
                {c.ok ? <CheckCircle2 size={15} /> : <span className="dot" />}
                {c.label}
              </li>
            ))}
          </ul>
          <div className="approval-actions">
            {canEdit && item.status !== "Approved" && (
              <button
                className="button"
                disabled={busy || dirty || !scanned || item.status === "In review"}
                onClick={() => action(`/content/${item.id}/request-review`, "POST", undefined, "Sent for human review")}
              >
                <Send size={15} /> {item.status === "In review" ? "Review requested" : "Request review"}
              </button>
            )}
            {["manager", "reviewer"].includes(data.user.role) && item.status !== "Approved" && (
              <button
                className="button primary"
                disabled={busy || dirty || !canApprove || item.status !== "In review"}
                title={!canApprove ? "Authors cannot approve their own content." : undefined}
                onClick={async () => {
                  const r = await action(`/content/${item.id}/approve`, "POST", undefined, "Exact version approved");
                  if (r) {
                    setCelebrate(true);
                    setTimeout(() => setCelebrate(false), 2600);
                  }
                }}
              >
                <ShieldCheck size={15} /> Approve this exact version
              </button>
            )}
            {latest && (
              <button className="button" onClick={() => receipt(latest)}>
                <ShieldCheck size={15} /> Approval receipt v{latest.version}
              </button>
            )}
          </div>
          {item.status === "In review" && !allResolved && (
            <p className="inline-warn small">
              <AlertTriangle size={14} /> Approval stays blocked until every finding is fixed or resolved with a reason.
            </p>
          )}
          {item.status !== "Approved" && data.user.role === "creator" && item.status === "In review" && data.judge_demo && (
            <p className="form-note">Switch to Reviewer in the demo bar to approve.</p>
          )}
          <p className="form-note">
            Approval locks this exact version (SHA-256) with the evidence used. It does not publish anything; distribution is a separate, authorised step.
          </p>
        </div>
        {celebrate && (
          <div className="approved-burst" role="status">
            <div>
              <ShieldCheck size={44} />
              <b>Approved</b>
              <span>Receipt issued for version {item.version}</span>
            </div>
          </div>
        )}
        <details className="more-tools">
          <summary>Translate this version (AI)</summary>
          <TranslationPanel
            item={item}
            canEdit={canEdit && !dirty}
            canReview={canApprove && !dirty}
            enabled={!!data.workspace.settings.ai_enabled}
            action={action}
          />
        </details>
      </section>
    </div>
  );
}

/* ---------- Original vs corrected ---------- */
function CompareStage({
  item,
  data,
  original,
  logos,
  onFix,
}: {
  item: Row;
  data: Data;
  original: Row | null;
  logos: Row[];
  onFix: () => void;
}) {
  const [versions, setVersions] = useState<Row[] | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState<"both" | "original" | "corrected">("both");
  useEffect(() => {
    api(`/content/${item.id}/history`).then(setVersions).catch(() => setVersions([]));
  }, [item.id, item.version]);
  const first = versions?.length ? versions[versions.length - 1] : null;
  const originalFindings: Numbered[] = original
    ? orderedFindings({ id: original.id, title: "", code: "", findings: original.findings || [] }, original).map((f, i) => ({ ...f, n: i + 1 }))
    : [];
  const unchanged = item.version === 1 || (first && first.body === item.body);
  return (
    <div className="compare-stage">
      <div className="compare-head">
        <div className="filter-row" role="group" aria-label="Comparison view">
          {(["both", "original", "corrected"] as const).map((m) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
              {m === "both" ? "Side by side" : m === "original" ? "Original" : "Corrected"}
            </button>
          ))}
        </div>
        <span className="form-note">The corrected version stays a draft until a reviewer approves it.</span>
      </div>
      <div className={"compare-grid mode-" + mode}>
        <section className="panel compare-side">
          <div className="panel-header">
            <div>
              <h2>Original · v{original?.version || first?.version || 1}</h2>
              <p>{original ? `${originalFindings.length} marked issue${originalFindings.length === 1 ? "" : "s"} · as submitted` : "As first submitted"}</p>
            </div>
            <span className="status-chip tone-red"><i />Submitted</span>
          </div>
          <div className="compare-body">
            {original ? (
              <CreativeCanvas creative={original} findings={originalFindings} verified={[]} selected={selected} onSelect={setSelected} show filter="all" compact />
            ) : versions === null ? (
              <Loader2 className="spin" />
            ) : (
              <div className="annotated-paper">
                <DiffView before={first?.body || item.body} after={item.body} side="before" />
              </div>
            )}
            {selected && (
              <p className="compare-caption">
                {(() => {
                  const f = originalFindings.find((x) => x.id === selected);
                  return f ? `${f.n}. ${outcomeMeta(f).label}: ${f.title}` : "";
                })()}
              </p>
            )}
          </div>
        </section>
        <section className="panel compare-side">
          <div className="panel-header">
            <div>
              <h2>Corrected · v{item.version}</h2>
              <p>
                {item.findings.length
                  ? `${item.findings.length} open finding${item.findings.length === 1 ? "" : "s"}`
                  : item.scan_hash
                    ? `Re-checked · no issues · ${(item.verified || []).length} verified value${(item.verified || []).length === 1 ? "" : "s"}`
                    : "Not checked yet"}
              </p>
            </div>
            <span className={"status-chip tone-" + (item.status === "Approved" ? "green" : "yellow")}>
              <i />
              {item.status === "Approved" ? "Approved" : "Draft · awaiting approval"}
            </span>
          </div>
          <div className="compare-body">
            {unchanged && !original?.origin ? (
              <div className="empty-mini">
                <p>No corrected version yet.</p>
                <button className="button small primary" onClick={onFix}>Open Fix & approve</button>
              </div>
            ) : unchanged ? (
              <div className="empty-mini">
                <p>No corrected version yet. Apply the suggested fixes to create one.</p>
                <button className="button small primary" onClick={onFix}>Open Fix & approve</button>
              </div>
            ) : original ? (
              <AdPreview text={item.body} logo={logos[0]} status={item.status} verified={item.verified} workspace={data.workspace.name} />
            ) : (
              <div className="annotated-paper">
                <DiffView before={first?.body || item.body} after={item.body} side="after" />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- History & audit for one record ---------- */
function HistoryStage({
  item,
  data,
  receipt,
  setModal,
  action,
  back,
}: {
  item: Row;
  data: Data;
  receipt: (r: Row) => void;
  setModal: (m: Modal) => void;
  action: Action;
  back: () => void;
}) {
  const [versions, setVersions] = useState<Row[]>([]);
  useEffect(() => {
    api(`/content/${item.id}/history`).then(setVersions).catch(() => setVersions([]));
  }, [item.id, item.version]);
  const events = data.activity.filter((a) => a.detail?.content_id === item.id);
  const decisions = data.decisions.filter((d) => d.content_id === item.id);
  const approvals = data.approvals.filter((a) => a.content_id === item.id);
  const creatives = data.creatives.filter((c) => c.content_id === item.id);
  return (
    <div className="history-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Versions</h2>
            <p>Every saved version is kept. Approvals bind to one exact version.</p>
          </div>
        </div>
        <ol className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <b>v{v.version}</b>
              <span>{formatTime(v.created)}</span>
              <p>{v.body}</p>
              {creatives
                .filter((c) => c.version === v.version)
                .map((c) => (
                  <small key={c.id}>
                    <ImageIcon size={12} /> {c.name} · {c.origin === "fixture" ? "sample layout" : c.provider} · SHA-256 {String(c.sha256).slice(0, 12)} · by {c.created_by}
                  </small>
                ))}
              {approvals
                .filter((a) => a.version === v.version)
                .map((a) => (
                  <button key={a.id} className="text-button" onClick={() => receipt(a)}>
                    <ShieldCheck size={13} /> Approved by {a.snapshot.reviewer} · receipt
                  </button>
                ))}
            </li>
          ))}
        </ol>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Decisions & activity</h2>
            <p>Who did what, when and why.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ACTION</th>
                <th>WHO</th>
                <th>DETAIL</th>
                <th>WHEN</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{e.action}</td>
                  <td>{e.actor}</td>
                  <td className="muted">
                    {e.detail?.reason || (e.detail?.version ? `v${e.detail.version}` : "") || (e.detail?.findings !== undefined ? `${e.detail.findings} findings` : "")}
                  </td>
                  <td className="muted">{formatTime(e.created)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {decisions.length > 0 && (
          <p className="form-note padded">{decisions.length} reviewer decision record{decisions.length === 1 ? "" : "s"} stored for this content.</p>
        )}
        {data.user.role === "manager" && (
          <div className="padded">
            <button
              className="text-button danger-text"
              onClick={() =>
                setModal({
                  title: "Delete this content?",
                  body: (
                    <div className="form">
                      <p>Stored text, creative images and review notes are removed. Receipt hashes and audit metadata remain. This cannot be undone.</p>
                      <button
                        className="button danger"
                        onClick={async () => {
                          const r = await action(`/content/${item.id}`, "DELETE", undefined, "Content payload deleted");
                          if (r) {
                            setModal(null);
                            back();
                          }
                        }}
                      >
                        Delete content
                      </button>
                    </div>
                  ),
                })
              }
            >
              <Trash2 size={14} /> Delete content payload
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- Downloadable annotated review report ---------- */
async function downloadReport(item: Row, data: Data, numbered: Numbered[], creative: Row | null) {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  let image = "";
  if (creative?.image_url) {
    try {
      const blob = await (await fetch(creative.image_url, { credentials: "same-origin" })).blob();
      image = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    } catch {}
  }
  const colors: Record<string, string> = { red: "#d92d20", orange: "#e8590c", yellow: "#b98900", blue: "#3a2bff", green: "#17803d", grey: "#8a857c" };
  const boxes = creative
    ? numbered
        .flatMap((f) =>
          rectsFor(f, creative).map(
            (r, k) =>
              `<div style="position:absolute;top:${r.y0 / 10}%;left:${r.x0 / 10}%;width:${(r.x1 - r.x0) / 10}%;height:${(r.y1 - r.y0) / 10}%;border:3px solid ${colors[outcomeMeta(f).tone]};border-radius:8px">${k === 0 ? `<b style="position:absolute;top:-12px;left:-12px;background:${colors[outcomeMeta(f).tone]};color:#fff;border-radius:50%;width:22px;height:22px;font:700 12px sans-serif;display:grid;place-items:center">${f.n}</b>` : ""}</div>`,
          ),
        )
        .join("")
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Brandora review · ${esc(item.title)}</title>
<style>body{font:14px/1.55 system-ui,sans-serif;color:#17133a;max-width:960px;margin:32px auto;padding:0 20px}h1{font-size:24px;margin:0}small{color:#6e6a64}.f{border:1px solid #ddd;border-left:5px solid;border-radius:8px;padding:12px 16px;margin:12px 0}.f h3{margin:4px 0;font-size:15px}blockquote{margin:8px 0;padding:8px 12px;background:#f6f4ee;border-radius:6px}.tag{font:600 11px sans-serif;text-transform:uppercase;letter-spacing:.5px}</style></head><body>
<small>BRANDORA · ANNOTATED REVIEW REPORT · generated ${esc(new Date().toLocaleString())}</small>
<h1>${esc(item.title)}</h1><p>${esc(item.channel)} · version ${item.version} · status <b>${esc(item.status)}</b> · ${esc(item.scan_coverage)}</p>
${creative?.origin === "fixture" ? "<p><b>Demo sample:</b> fictional content. Text positions and the logo finding are predefined; text findings come from the rule engine.</p>" : ""}
${image ? `<div style="position:relative;display:inline-block;width:100%"><img src="${image}" style="width:100%;display:block;border-radius:8px">${boxes}</div>` : `<blockquote>${esc(item.body)}</blockquote>`}
<h2>${numbered.length} finding(s)</h2>
${numbered
  .map((f) => {
    const m = outcomeMeta(f);
    return `<div class="f" style="border-left-color:${colors[m.tone]}"><span class="tag" style="color:${colors[m.tone]}">${f.n} · ${esc(m.label)}</span> <small>${esc(f.rule_code)} · ${esc(f.engine)}</small><h3>${esc(f.title)}</h3>${f.span ? `<p><b>Submitted:</b> “${esc(f.span)}”</p>` : ""}<p>${esc(f.message)}</p>${f.suggestion ? `<p><b>Suggested correction:</b> ${esc(f.suggestion)}</p>` : ""}${f.evidence ? `<blockquote><b>${esc(f.evidence.title)} · v${esc(f.evidence.version)}</b> (owner ${esc(f.evidence.owner)})<br>${esc(f.evidence.excerpt)}</blockquote>` : "<p><i>No approved record mapped; no factual verdict.</i></p>"}<p><small>Confidence: ${esc(m.confidence)}${f.review ? ` · Review: ${esc(f.review.state)} by ${esc(f.review.by)}` : ""}</small></p>${(f.review_log || []).map((d: Row) => `<p><small>${esc(d.by)} (${esc(d.role)}) ${esc(labelFor(d.action))} · ${esc(formatTime(d.at))}: ${esc(d.reason)}</small></p>`).join("")}</div>`;
  })
  .join("")}
${(item.verified || []).length ? `<h2>Verified values</h2><ul>${item.verified.map((v: Row) => `<li>“${esc(v.span)}” — ${esc(v.title)} · ${esc(v.evidence?.title)} v${esc(v.evidence?.version)}</li>`).join("")}</ul>` : ""}
${data.approvals.filter((a) => a.content_id === item.id).map((a) => `<p><b>Approval receipt</b> v${a.version} by ${esc(a.snapshot.reviewer)} · ${esc(new Date(a.created).toLocaleString())} · SHA-256 ${esc(a.content_hash)}</p>`).join("")}
<p><small>Citations establish traceability, not independent truth. AI outputs require human review.</small></p></body></html>`;
  download(`brandora-review-${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`, html, "text/html");
}
