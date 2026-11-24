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
  ChevronLeft,
  ChevronRight,
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
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { TranslationPanel } from "./intelligence";
import { SwitchRole, useDemo } from "./demo-context";
import {
  Action,
  Data,
  Modal,
  Row,
  Tone,
  api,
  contentCreative,
  download,
  findingPage,
  formatDate,
  formatTime,
  isDocument,
  orderedFindings,
  originalCreative,
  outcomeMeta,
  wordDiff,
} from "./shared";

export type Stage = "review" | "fix" | "compare" | "history";
type Filter = "all" | "critical" | "gap" | "review" | "tone" | "access" | "visual" | "verified";
type Numbered = Row & { n: number };
type Rect = { y0: number; x0: number; y1: number; x1: number; page?: number };

const TONE_RANK: Record<Tone, number> = {
  red: 5,
  orange: 4,
  yellow: 3,
  teal: 3,
  blue: 2,
  violet: 2,
  green: 1,
  grey: 0,
};
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["critical", "Critical"],
  ["gap", "Evidence gaps"],
  ["review", "Needs review"],
  ["tone", "Tone & messaging"],
  ["access", "Accessibility"],
  ["visual", "Visual"],
  ["verified", "Verified"],
];
const passes = (f: Row, filter: Filter) => {
  if (filter === "all") return true;
  if (filter === "verified") return false;
  const g = outcomeMeta(f).group;
  return filter === "critical" ? g === "critical" || (g === "visual" && outcomeMeta(f).tone === "red") : g === filter;
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
  if (f.kind === "visual" || (f.kind === "access" && f.box)) {
    const [y0, x0, y1, x1] = f.box || [0, 0, 0, 0];
    return y1 > y0 && x1 > x0 ? [{ y0, x0, y1, x1, page: f.page ?? 0 }] : [];
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
        page: r.page ?? 0,
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

/* ---------- Annotated content: image creative, multi-page document, or text ---------- */
function CreativeCanvas({
  creative,
  findings,
  verified,
  selected,
  onSelect,
  show,
  filter,
  compact = false,
  page: pageProp,
  onPage,
  zoom: zoomProp,
  onZoom,
}: {
  creative: Row;
  findings: Numbered[];
  verified: Row[];
  selected: string | null;
  onSelect: (id: string) => void;
  show: boolean;
  filter: Filter;
  compact?: boolean;
  page?: number;
  onPage?: (n: number) => void;
  zoom?: number;
  onZoom?: (z: number) => void;
}) {
  const [ownPage, setOwnPage] = useState(0),
    [ownZoom, setOwnZoom] = useState(1);
  const pages: Row[] = creative.pages?.length
    ? creative.pages
    : [{ index: 0, width: creative.width, height: creative.height, image_url: creative.image_url }];
  const page = Math.min(pageProp ?? ownPage, pages.length - 1);
  const setPage = (n: number) => (onPage ? onPage(n) : setOwnPage(n));
  const zoom = zoomProp ?? ownZoom;
  const setZoom = (z: number) => (onZoom ? onZoom(z) : setOwnZoom(z));
  const current = pages[page] || pages[0];
  const visible = findings.filter((f) => passes(f, filter));
  const stacked: Record<string, number> = {};
  const greens = filter === "all" || filter === "verified" ? verified : [];
  const unlocated = visible.filter(
    (f) => (f.kind === "visual" || f.kind === "access") && !f.span && !rectsFor(f, creative).length,
  );
  const onPageList = (n: number) => visible.filter((f) => findingPage(f, creative) === n);
  const worst = (list: Row[]) =>
    list.map((f) => outcomeMeta(f).tone).sort((a, b) => TONE_RANK[b] - TONE_RANK[a])[0];
  const here = (r: Rect) => (r.page ?? 0) === page;
  return (
    <div className={"canvas-wrap " + (compact ? "compact" : "")}>
      {(pages.length > 1 || !compact) && (
        <div className="canvas-tools">
          {pages.length > 1 ? (
            <div className="page-nav" role="group" aria-label="Pages">
              <button className="icon-button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
                <ChevronLeft size={16} />
              </button>
              <span>
                Page <b>{page + 1}</b> of {pages.length}
                {onPageList(page).length > 0 && ` · ${onPageList(page).length} finding${onPageList(page).length === 1 ? "" : "s"}`}
              </span>
              <button className="icon-button" disabled={page >= pages.length - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <span />
          )}
          {!compact && (
            <div className="zoom-tools" role="group" aria-label="Zoom">
              <button className="icon-button" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))} aria-label="Zoom out">
                <ZoomOut size={15} />
              </button>
              <button className="zoom-level" onClick={() => setZoom(1)} title="Fit to width">
                {Math.round(zoom * 100)}%
              </button>
              <button className="icon-button" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + 0.5))} aria-label="Zoom in">
                <ZoomIn size={15} />
              </button>
            </div>
          )}
        </div>
      )}
      <div className={"canvas-scroll" + (zoom > 1 ? " zoomed" : "")}>
        <div
          className="creative-canvas"
          style={{
            aspectRatio: `${current.width || 4} / ${current.height || 3}`,
            // Tall pages are capped to the viewport so the page arrows and thumbnails stay in view.
            width: `min(${zoom * 100}%, ${((zoom * 70 * (current.width || 4)) / (current.height || 3)).toFixed(2)}vh)`,
            margin: "0 auto",
          }}
        >
          <img
            src={current.image_url}
            alt={pages.length > 1 ? `Page ${page + 1} of ${pages.length}: ${creative.name}` : creative.alt_text || "Submitted creative"}
            draggable={false}
          />
          {show &&
            greens.map((v) =>
              rectsFor(v, creative)
                .filter(here)
                .map((r, k) => (
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
              return rectsFor(f, creative)
                .filter(here)
                .map((r, k) => {
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
                        (f.kind === "visual" || f.kind === "access" ? " visual" : "")
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
      </div>
      {pages.length > 1 && (
        <div className="page-strip" role="tablist" aria-label="Page thumbnails">
          {pages.map((p, i) => {
            const list = onPageList(i);
            return (
              <button
                key={i}
                role="tab"
                aria-selected={i === page}
                className={"page-thumb" + (i === page ? " active" : "")}
                onClick={() => setPage(i)}
                aria-label={`Page ${i + 1}: ${list.length} finding${list.length === 1 ? "" : "s"}`}
              >
                <img src={p.image_url} alt="" loading="lazy" />
                <span>{i + 1}</span>
                {list.length > 0 && <b className={"tone-" + worst(list)}>{list.length}</b>}
              </button>
            );
          })}
        </div>
      )}
      {show &&
        unlocated.map((f) => (
          <button key={f.id} className={"canvas-note tone-" + outcomeMeta(f).tone} onClick={() => onSelect(f.id)}>
            <span className="anno-num static" data-mark={f.id}>
              {f.n}
            </span>
            {f.title} — {f.kind === "visual" ? "no location on the image" : "applies to the whole creative"}.
          </button>
        ))}
    </div>
  );
}

/* Alt text belongs to the reviewed version: editing it re-checks the content and ends any approval. */
function AltTextBox({
  creative,
  item,
  canEdit,
  action,
  busy,
}: {
  creative: Row;
  item: Row;
  canEdit: boolean;
  action: Action;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(creative.alt_text || "");
  useEffect(() => setValue(creative.alt_text || ""), [creative.id, creative.alt_text]);
  const save = async () => {
    const r = await action(
      `/creatives/${creative.id}/alt-text`,
      "PUT",
      { alt_text: value, expected_version: item.version },
      "Alt text saved · this version was re-checked",
    );
    if (r) setEditing(false);
  };
  return (
    <div className="alt-box">
      <small>ALT TEXT · read aloud by screen readers · checked against the accessibility standard</small>
      {editing ? (
        <>
          <textarea rows={2} maxLength={600} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Alt text" />
          <div className="alt-actions">
            <button className="button small" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="button small primary" disabled={busy} onClick={save}>
              Save & re-check
            </button>
          </div>
          <span className="form-note">Saving re-checks this version and ends any approval, because alt text is part of what is published.</span>
        </>
      ) : (
        <p>
          {creative.alt_text ? `“${creative.alt_text}”` : <i>No alt text yet.</i>}{" "}
          {canEdit && (
            <button className="text-button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </p>
      )}
      {creative.origin === "ai" && !editing && <span className="form-note">Suggested by AI from the image. Check that it says what matters.</span>}
    </div>
  );
}

/* Measured colours next to the approved palette. */
function Swatches({ colours }: { colours: Row[] }) {
  return (
    <div className="swatch-row">
      {colours.map((c) => (
        <span key={c.hex + (c.name || "")} className="swatch" title={c.name || c.hex}>
          <i style={{ background: c.hex }} />
          <b>{c.name || c.hex}</b>
          <small>{c.share ? `${(c.share * 100).toFixed(1)}% of the area · ΔE ${c.delta_e} · suggested: ${c.nearest}` : c.hex}</small>
        </span>
      ))}
    </div>
  );
}

/* What an accessibility finding measured, shown in the measured colours or size. */
function AccessSample({ f, creative }: { f: Row; creative: Row | null }) {
  const m = f.measure || {};
  if (m.fg && m.bg)
    return (
      <div className="contrast-sample">
        <p style={{ color: m.fg, background: m.bg }} aria-hidden="true" title="Reproduced in the measured colours">{f.span}</p>
        <span>
          <i style={{ background: m.fg }} />
          {m.fg} on <i style={{ background: m.bg }} />
          {m.bg} · <b>{m.ratio}:1</b> measured · needs {m.target}:1{m.large ? " (large text)" : ""}
        </span>
      </div>
    );
  if (m.size_pt)
    return (
      <div className="contrast-sample">
        <p style={{ fontSize: Math.max(8, m.size_pt * 1.25) }} aria-hidden="true">{f.span}</p>
        <span>
          Set at <b>{m.size_pt} pt</b>
        </span>
      </div>
    );
  return (
    <div className="contrast-sample">
      {f.box && creative ? <LogoCrop creative={creative} box={f.box} page={f.page ?? 0} /> : null}
      <span>
        {m.alt ? <>Alt text: “{m.alt}”</> : "No alt text"} · {m.image || "Image"}
      </span>
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
      ["Low Confidence", "Tone Issue", "Accessibility"].includes(f.outcome) &&
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
    ["request_evidence", "Request evidence", canDecide && !["visual", "access"].includes(f.kind) && f.outcome !== "Tone Issue", "Ask the evidence owner."],
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
            {(creative?.pages?.length || 0) > 1 && <span className="page-chip">Page {findingPage(f, creative) + 1}</span>}
            <code>{f.rule_code}</code>
          </span>
          <b>{f.title}</b>
          {f.span ? (
            <q>{f.span}</q>
          ) : f.kind === "visual" ? (
            <small>{f.measure?.colours ? `${f.measure.colours.length} colour${f.measure.colours.length === 1 ? "" : "s"} outside the palette` : "Logo area on the creative"}</small>
          ) : f.kind === "access" ? (
            <small>{f.measure?.image || "Image"}</small>
          ) : null}
        </span>
        <ChevronDown size={16} className="finding-caret" />
      </button>
      {open && (
        <div className="finding-body">
          <div className="evidence-compare">
            <div className="ev-side submitted">
              <small>SUBMITTED CONTENT</small>
              {f.measure?.colours ? (
                <Swatches colours={f.measure.colours} />
              ) : f.kind === "visual" && creative ? (
                <LogoCrop creative={creative} box={f.box} page={f.page ?? 0} />
              ) : f.kind === "access" ? (
                <AccessSample f={f} creative={creative} />
              ) : (
                <p className={meta.group === "critical" ? "struck" : ""}>
                  {f.span || "—"}
                </p>
              )}
            </div>
            <div className="ev-side approved">
              <small>APPROVED COMPANY INFORMATION</small>
              {f.measure?.approved ? (
                <Swatches colours={f.measure.approved} />
              ) : f.kind === "visual" ? (
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
          {String(f.title).startsWith("Alt text") && creative && !f.resolved &&
            (isDocument(creative) ? (
              <p className="form-note">Set alt text on this picture in the deck file, then upload the revised file in Fix & approve.</p>
            ) : (
              <AltTextBox creative={creative} item={item} canEdit={canEdit} action={action} busy={busy} />
            ))}
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
              Reviewers and managers record decisions. <SwitchRole role="reviewer" />
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

function LogoCrop({ creative, box, page = 0 }: { creative: Row; box: number[]; page?: number }) {
  const source = creative.pages?.[page] || { image_url: creative.image_url, width: creative.width, height: creative.height };
  const [y0, x0, y1, x1] = box || [0, 0, 0, 0];
  if (!(y1 > y0 && x1 > x0)) return <p>Not located on the image.</p>;
  const w = (x1 - x0) / 1000,
    h = (y1 - y0) / 1000;
  return (
    <div
      className="logo-crop"
      style={{
        aspectRatio: `${(w * (source.width || 4)) / (h * (source.height || 3))}`,
        backgroundImage: `url(${source.image_url})`,
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
/* One label for a version's review state, used wherever that version appears. */
function versionLabel(status: string, previouslyApproved: boolean) {
  if (status === "Approved") return "Approved";
  if (status === "Needs reassessment") return previouslyApproved ? "Previously approved · needs reassessment" : "Needs reassessment";
  if (status === "In review") return "In review · awaiting approval";
  return "Draft · awaiting approval";
}

function AdPreview({
  text,
  logo,
  status,
  verified = [],
  workspace,
  previouslyApproved = false,
}: {
  text: string;
  logo?: Row;
  status: string;
  verified?: Row[];
  workspace: string;
  previouslyApproved?: boolean;
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
        {approved ? "Approved version" : status === "Draft" ? "Draft · awaiting human approval" : versionLabel(status, previouslyApproved)}
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
    [rereadError, setRereadError] = useState(""),
    [page, setPage] = useState(() => {
      const first = numbered.find((f) => !f.resolved) || numbered[0];
      return first && creative ? findingPage(first, creative) : 0;
    }),
    [zoom, setZoom] = useState(1);
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
  const pageOf = (id: string) => {
    const f = numbered.find((x) => x.id === id);
    if (f && creative) setPage(findingPage(f, creative));
  };
  const select = useCallback((id: string) => {
    setSelected(id);
    pageOf(id);
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-card="${id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }, [numbered, creative]); // eslint-disable-line react-hooks/exhaustive-deps
  const unresolved = numbered.filter((f) => !f.resolved);
  const awaiting = unresolved.filter((f) => !f.review);
  // A check is current only for this exact text and the latest Company Hub revision.
  const stale = !item.scan_hash || item.scan_revision !== data.workspace.revision || item.status === "Draft";
  const aiIncomplete = !stale && String(item.scan_coverage || "").startsWith("AI incomplete");
  const canEdit =
    data.user.role === "manager" ||
    (["creator", "partner"].includes(data.user.role) && item.author_id === data.user.id);
  const counts = {
    red: numbered.filter((f) => outcomeMeta(f).tone === "red").length,
    orange: numbered.filter((f) => outcomeMeta(f).tone === "orange").length,
    yellow: numbered.filter((f) => ["yellow", "blue"].includes(outcomeMeta(f).tone)).length,
    violet: numbered.filter((f) => outcomeMeta(f).tone === "violet").length,
    teal: numbered.filter((f) => outcomeMeta(f).tone === "teal").length,
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
        {isDocument(creative) ? (
          <>
            <span className="origin-tag rules">
              <FileText size={13} />
              {creative!.origin === "pptx" ? "PowerPoint deck" : "PDF"} · {creative!.page_count} {creative!.origin === "pptx" ? "slide" : "page"}{creative!.page_count === 1 ? "" : "s"} · {creative!.origin === "pdf-ocr" ? "read with AI OCR" : "read from the file, no AI"}
            </span>
            <span>{(creative!.warnings || [])[0]}</span>
          </>
        ) : creative?.origin === "fixture" || (!creative && original?.origin === "fixture") ? (
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
        {creative && canEdit && !isDocument(creative) && (
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
          {data.user.role === "manager" ? (
            <button className="text-button" onClick={onSettings}>
              Open settings <ArrowRight size={13} />
            </button>
          ) : (
            <SwitchRole role="manager" label="Switch to Manager to enable AI" />
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
      {aiIncomplete && (
        <div className="inline-warn ai-retry">
          <AlertTriangle size={15} />
          <span>
            <b>The AI part of this check did not finish</b> (the provider was busy or unavailable). Rule checks completed, but approval stays blocked until a complete check.
          </span>
          {data.user.role !== "partner" && (
            <button
              className="button small"
              disabled={busy}
              onClick={() => action(`/content/${item.id}/scan`, "POST", undefined, "Check re-run")}
            >
              Retry check
            </button>
          )}
          {data.user.role === "manager" ? (
            <button className="text-button" onClick={onSettings}>
              Or turn AI off
            </button>
          ) : (
            <SwitchRole role="manager" label="Manager can turn AI off" />
          )}
        </div>
      )}
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
                  page={page}
                  onPage={setPage}
                  zoom={zoom}
                  onZoom={setZoom}
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
                {counts.violet > 0 && <span className="tone-violet"><i />Tone & messaging · {counts.violet}</span>}
                {counts.teal > 0 && <span className="tone-teal"><i />Accessibility · {counts.teal}</span>}
                <span className="tone-green"><i />Verified · {counts.green}</span>
              </div>
              {creative && !isDocument(creative) && (
                <AltTextBox creative={creative} item={item} canEdit={canEdit} action={action} busy={busy} />
              )}
              {creative && (
                <details className="ocr-details">
                  <summary>
                    <ImageIcon size={14} />
                    {isDocument(creative) ? "Text read from the file" : "Text read from the creative"}
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
                    onSelect={() => {
                      if (selected === f.id) setSelected(null);
                      else {
                        setSelected(f.id);
                        pageOf(f.id);
                      }
                    }}
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
  const demo = useDemo();
  const doc = isDocument(creative);
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
  const uploadDocument = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("expected_version", String(item.version));
    await action(`/content/${item.id}/creative`, "POST", form, "Revised file uploaded and re-checked page by page");
  };
  const downloadCorrections = () =>
    download(
      `brandora-corrections-${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`,
      [`Corrections for ${item.title} (version ${item.version})`, "", ...fixable.map((f) => `Page ${findingPage(f, creative) + 1} · ${f.title}${f.span ? `: “${f.span}”` : ""}${f.suggestion ? ` → “${f.suggestion}”` : ""}\n   ${f.message}`)].join("\n"),
      "text/plain",
    );
  const approvals = data.approvals.filter((a) => a.content_id === item.id);
  const latest = approvals[0];
  const scanned = !!item.scan_hash && item.scan_revision === data.workspace.revision && !["Draft", "Needs reassessment"].includes(item.status);
  const allResolved = numbered.every((f) => f.resolved);
  const checks = [
    { ok: scanned, label: "Current version checked against Company Hub" },
    { ok: scanned && allResolved, label: allResolved ? "Every finding fixed or resolved" : `${numbered.filter((f) => !f.resolved).length} finding(s) still open` },
    { ok: ["In review", "Approved"].includes(item.status), label: "Review requested by the author" },
    { ok: item.status === "Approved" || canApprove, label: "Independent reviewer (not the author or last editor)" },
    ...(String(item.scan_coverage || "").startsWith("AI incomplete") ? [{ ok: false, label: "AI check incomplete: retry the check" }] : []),
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
          {canEdit && !doc && fixable.some((f) => f.suggestion && !done[f.id]) && (
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
                {f.kind === "access" ? (
                  <>
                    <p className="fix-explain">{f.message}</p>
                    {String(f.title).startsWith("Alt text") && creative && !doc ? (
                      <AltTextBox creative={creative} item={item} canEdit={canEdit} action={action} busy={busy} />
                    ) : (
                      <p className="fix-explain">
                        {doc ? `Fix this on ${creative?.origin === "pptx" ? "slide" : "page"} ${findingPage(f, creative) + 1} of the source file, then upload the revised file.` : "Fix the colours in the design, then upload the revised creative."} A reviewer can also record an exemption with a reason.
                      </p>
                    )}
                  </>
                ) : doc ? (
                  <>
                    <div className="fix-change">
                      <del>{f.span || f.title}</del>
                      <ArrowRight size={14} />
                      <span className="fix-to">
                        {f.suggestion || (meta.group === "gap" ? "Remove it, or rewrite with an approved claim" : meta.group === "review" ? "Support it with approved evidence, or remove it" : "Rewrite it in the brand voice")}
                      </span>
                    </div>
                    <p className="fix-explain">Change this on {creative?.origin === "pptx" ? "slide" : "page"} {findingPage(f, creative) + 1} of the source file.</p>
                  </>
                ) : f.kind === "visual" ? (
                  <>
                    <p className="fix-explain">
                      {f.measure?.colours
                        ? `Brandora does not edit images. Swap ${f.measure.colours.map((c: Row) => c.hex).join(", ")} for approved colours (suggested: ${f.measure.colours.map((c: Row) => c.nearest).join(", ")}) in your design tool, then upload the revised file. A reviewer can also accept them with a reason.`
                        : "Brandora does not edit images. Replace the logo with the approved reference in your design tool, then upload the revised creative to re-check it."}
                    </p>
                    {canEdit && (
                      <label className="button small upload-inline">
                        <Upload size={14} /> Upload revised creative
                        <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && uploadRevision(e.target.files[0])} />
                      </label>
                    )}
                    {demo.active && (
                      <a className="text-button" href="/api/demo/assets/corrected-creative.png" download>
                        Download a corrected sample ad to upload
                      </a>
                    )}
                    {!data.workspace.settings.ai_enabled && (
                      <p className="form-note">
                        Reading a revised image needs live AI.{" "}
                        {data.user.role === "manager" ? (
                          <button className="text-button" onClick={onSettings}>Enable it</button>
                        ) : (
                          <SwitchRole role="manager" label="Switch to Manager to enable it" />
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
                        placeholder={meta.group === "gap" ? "Rewrite with an approved claim, or leave empty to remove" : meta.group === "tone" ? "Rewrite in the brand voice" : "Your correction"}
                        disabled={!canEdit || !!done[f.id]}
                        onChange={(e) => setEdits({ ...edits, [f.id]: e.target.value })}
                      />
                    </div>
                    <p className="fix-explain">
                      {meta.group === "gap"
                        ? "The suggested rewrite uses a claim from the Approved claims register."
                        : meta.group === "tone"
                          ? `Follows ${f.evidence?.title} v${f.evidence?.version}. A reviewer can also accept the wording in context.`
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
                            <button
                              className="button small primary"
                              onClick={() => apply(f, replacement)}
                              disabled={!replacement && !(meta.group === "gap" || (meta.group === "tone" && ["Off-brand wording", "Off-message promise"].includes(f.title)))}
                            >
                              {replacement ? "Accept" : meta.group === "tone" ? "Remove wording" : "Remove claim"}
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
            <h2>{doc ? "Revised file" : "Corrected draft"}</h2>
            <p>{dirty ? "Unsaved changes · save to create a new version and re-check it" : `Version ${item.version} · ${item.status}`}</p>
          </div>
          <button className="text-button" onClick={onCompare}>
            Compare <ArrowUpRight size={13} />
          </button>
        </div>
        <div className="fix-draft-body">
          {doc ? (
            <div className="doc-revision">
              <p>
                This is a {creative!.origin === "pptx" ? "PowerPoint deck" : "PDF"} of {creative!.page_count} {creative!.origin === "pptx" ? "slide" : "page"}{creative!.page_count === 1 ? "" : "s"}. Brandora does not edit files: make the corrections in the source file, then upload the revised file. It becomes a new version and is re-checked page by page, including contrast, text size and alt text.
              </p>
              <div className="doc-revision-actions">
                <button className="button small" onClick={downloadCorrections}>
                  <Download size={14} /> Download corrections list
                </button>
                {canEdit && (
                  <label className="button small primary upload-inline">
                    <Upload size={14} /> Upload revised file
                    <input type="file" accept=".pdf,.pptx" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && uploadDocument(e.target.files[0])} />
                  </label>
                )}
              </div>
              {demo.active && creative!.origin === "pdf" && (
                <a className="text-button" href="/api/demo/assets/festive-brochure-corrected.pdf" download>
                  Download the corrected sample brochure to upload
                </a>
              )}
              {!canEdit && (
                <p className="form-note">
                  Only the author or a manager uploads revisions. <SwitchRole role="creator" />
                </p>
              )}
            </div>
          ) : (
            <>
          {fromCreative ? (
            <AdPreview text={draft} logo={logos[0]} status={dirty ? "Draft" : item.status} verified={dirty ? [] : item.verified} workspace={data.workspace.name} previouslyApproved={!dirty && data.approvals.some((a) => a.content_id === item.id && a.version === item.version)} />
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
          {!canEdit && (
            <p className="form-note">
              Only the author or a manager edits this draft. Reviewers decide on findings and approval. <SwitchRole role="creator" />
            </p>
          )}
            </>
          )}
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
          {item.status === "In review" && !canApprove && (
            <p className="form-note">
              An independent reviewer approves this version. <SwitchRole role="reviewer" />
            </p>
          )}
          {item.status !== "In review" && item.status !== "Approved" && !canEdit && scanned && allResolved && (
            <p className="form-note">
              The author requests review first. <SwitchRole role="creator" />
            </p>
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
                {item.scan_hash && (item.scan_revision !== data.workspace.revision || item.status === "Needs reassessment")
                  ? "Recheck required · approved records changed since the last check"
                  : item.findings.length
                    ? `${item.findings.length} open finding${item.findings.length === 1 ? "" : "s"}`
                    : item.scan_hash
                      ? `Re-checked · no issues · ${(item.verified || []).length} verified value${(item.verified || []).length === 1 ? "" : "s"}`
                      : "Not checked yet"}
              </p>
            </div>
            <span className={"status-chip tone-" + (item.status === "Approved" ? "green" : item.status === "Needs reassessment" ? "orange" : "yellow")}>
              <i />
              {versionLabel(item.status, data.approvals.some((a) => a.content_id === item.id && a.version === item.version))}
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
            ) : isDocument(contentCreative(data, item)) ? (
              <CreativeCanvas
                creative={contentCreative(data, item)!}
                findings={orderedFindings(item, contentCreative(data, item)).map((f, i) => ({ ...f, n: i + 1 }))}
                verified={item.verified || []}
                selected={null}
                onSelect={() => {}}
                show
                filter="all"
                compact
              />
            ) : original ? (
              <AdPreview text={item.body} logo={logos[0]} status={item.status} verified={item.verified} workspace={data.workspace.name} previouslyApproved={data.approvals.some((a) => a.content_id === item.id && a.version === item.version)} />
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
  const colors: Record<string, string> = { red: "#d92d20", orange: "#e8590c", yellow: "#b98900", blue: "#3a2bff", violet: "#8b2fc9", teal: "#0f7c86", green: "#17803d", grey: "#8a857c" };
  const multi = (creative?.pages?.length || 0) > 1;
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
    return `<div class="f" style="border-left-color:${colors[m.tone]}"><span class="tag" style="color:${colors[m.tone]}">${f.n} · ${esc(m.label)}</span> <small>${esc(f.rule_code)} · ${esc(f.engine)}</small><h3>${esc(f.title)}${multi ? ` <small>· page ${findingPage(f, creative) + 1}</small>` : ""}</h3>${f.span ? `<p><b>Submitted:</b> “${esc(f.span)}”</p>` : ""}${f.measure?.ratio ? `<p><b>Measured:</b> ${esc(f.measure.fg)} on ${esc(f.measure.bg)} = ${esc(f.measure.ratio)}:1 (minimum ${esc(f.measure.target)}:1)</p>` : ""}<p>${esc(f.message)}</p>${f.suggestion ? `<p><b>Suggested correction:</b> ${esc(f.suggestion)}</p>` : ""}${f.evidence ? `<blockquote><b>${esc(f.evidence.title)} · v${esc(f.evidence.version)}</b> (owner ${esc(f.evidence.owner)})<br>${esc(f.evidence.excerpt)}</blockquote>` : "<p><i>No approved record mapped; no factual verdict.</i></p>"}<p><small>Confidence: ${esc(m.confidence)}${f.review ? ` · Review: ${esc(f.review.state)} by ${esc(f.review.by)}` : ""}</small></p>${(f.review_log || []).map((d: Row) => `<p><small>${esc(d.by)} (${esc(d.role)}) ${esc(labelFor(d.action))} · ${esc(formatTime(d.at))}: ${esc(d.reason)}</small></p>`).join("")}</div>`;
  })
  .join("")}
${(item.verified || []).length ? `<h2>Verified values</h2><ul>${item.verified.map((v: Row) => `<li>“${esc(v.span)}” — ${esc(v.title)} · ${esc(v.evidence?.title)} v${esc(v.evidence?.version)}</li>`).join("")}</ul>` : ""}
${data.approvals.filter((a) => a.content_id === item.id).map((a) => `<p><b>Approval receipt</b> v${a.version} by ${esc(a.snapshot.reviewer)} · ${esc(new Date(a.created).toLocaleString())} · SHA-256 ${esc(a.content_hash)}</p>`).join("")}
<p><small>Citations establish traceability, not independent truth. AI outputs require human review.</small></p></body></html>`;
  download(`brandora-review-${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`, html, "text/html");
}
