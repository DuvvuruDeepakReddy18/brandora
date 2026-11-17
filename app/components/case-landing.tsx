"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  FileCheck2,
  Link2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import type { createInspector } from "./case-inspector";
import "./case-landing.css";

const cases = [
  {
    title: "The overpromise",
    category: "CLAIM ACCURACY",
    color: "#ac452e",
    ink: "#fff5dc",
    kind: "claim",
    before: "50%",
    after: "30%",
    subtitle: "less plastic.",
    issue: "The claim goes further than the evidence.",
    finding:
      "The draft says 50% less plastic. The approved packaging study supports 30%, by weight, versus the previous bottle.",
    source: "Packaging study · §2.4",
    rule: "Approved finding: 30% less plastic by weight",
    fix: "30% less plastic by weight.*",
    note: "*Compared with our previous bottle.",
    headline: "A big claim. A small mismatch.",
    description:
      "Connect every promise to an approved source. Brandora catches the distance between what you say and what you can support.",
  },
  {
    title: "A voice out of tune",
    category: "TONE OF VOICE",
    color: "#284b82",
    ink: "#f0eadb",
    kind: "voice",
    before: "CRUSH IT.",
    after: "Go gently.",
    subtitle: "a little everyday care.",
    issue: "The wording doesn’t sound like this brand.",
    finding:
      "“Crush it” is forceful and hype-led. FORMA’s voice guide calls for calm, direct language without superlatives or pressure.",
    source: "Voice guide · Principle 03",
    rule: "Calm. Considered. Human.",
    fix: "Go gently. A little everyday care.",
    note: "Voice aligned with the approved guide.",
    headline: "Good words. The wrong voice.",
    description:
      "Give your content the same character, wherever it appears. Review a specific suggestion against your actual voice guidelines.",
  },
  {
    title: "A shade off-brand",
    category: "VISUAL CONSISTENCY",
    color: "#d2ac4e",
    ink: "#282a24",
    kind: "visual",
    before: "#745BC4",
    after: "#456358",
    subtitle: "the details are the brand.",
    issue: "A campaign colour has drifted off-brand.",
    finding:
      "The draft uses violet. The approved FORMA palette specifies forest green for this campaign. The inspector highlights the mismatch before replacing it.",
    source: "Brand book · Palette 01",
    rule: "Primary campaign colour: Forest / #456358",
    fix: "Approved forest palette applied.",
    note: "Layout and logo placement preserved.",
    headline: "One small shade. A different brand.",
    description:
      "Check the details people recognise: colour, logo use and visual consistency. Keep the correction connected to the rule behind it.",
  },
  {
    title: "Lost in translation",
    category: "MEANING & LANGUAGE",
    color: "#4d6558",
    ink: "#f1ecd6",
    kind: "language",
    before: "50 %",
    after: "30 %",
    subtitle: "moins de plastique.",
    issue: "The translation changed the approved number.",
    finding:
      "The French version carries an older 50% claim. Brandora compares it with the approved English source and restores both the number and its qualification.",
    source: "Approved English master · v03",
    rule: "30% less plastic by weight vs. previous bottle",
    fix: "30 % de plastique en moins, en poids.*",
    note: "*Par rapport à notre ancien flacon.",
    headline: "Another language. The same promise.",
    description:
      "Keep numbers, names and meaning intact. Compare translations with their source before your team signs them off.",
  },
  {
    title: "The missing sign-off",
    category: "HUMAN APPROVAL",
    color: "#b7a2a6",
    ink: "#352e35",
    kind: "approval",
    before: "READY?",
    after: "REVIEW.",
    subtitle: "the final word is yours.",
    issue: "A clean check is not a human approval.",
    finding:
      "The content has suggestions, but no reviewer has signed off on this version. Brandora routes the exact version to a person before release.",
    source: "Review policy · Campaign release",
    rule: "A named reviewer must approve this version",
    fix: "Version v03 routed to human review.",
    note: "AI checks never count as a human decision.",
    headline: "AI does the checking. You make the call.",
    description:
      "Bring the source, the original and the suggestion to the reviewer. Accept the change or send it back with a clear decision.",
  },
  {
    title: "Yesterday’s version",
    category: "VERSION HISTORY",
    color: "#333f48",
    ink: "#f0e4cf",
    kind: "version",
    before: "v01",
    after: "v03",
    subtitle: "keep the whole story.",
    issue: "The team is reviewing an outdated draft.",
    finding:
      "The source-linked correction lives in v03, but the shared draft is v01. Brandora keeps the latest content, its earlier versions and the decision trail together.",
    source: "Version history · FORMA campaign",
    rule: "Latest reviewable version: v03",
    fix: "Latest version connected to its history.",
    note: "Earlier drafts stay in the record.",
    headline: "Nothing lost between versions.",
    description:
      "See what changed, why it changed and who decided. The next person starts with the whole story.",
  },
] as const;
const mod = (v: number, n: number) => ((v % n) + n) % n;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
type Decision = "pending" | "approved" | "changes";
type Inspector = ReturnType<typeof createInspector>;

function Artwork({ index, fixed = false }: { index: number; fixed?: boolean }) {
  const c = cases[index];
  return (
    <div className={`ca-art ca-art-${c.kind} ${fixed ? "is-fixed" : ""}`}>
      <div className="ca-art-top">
        <span>FORMA®</span>
        <span>EVERYDAY, CONSIDERED.</span>
      </div>
      {c.kind === "visual" ? (
        <div className="ca-colour-art">
          <i />
          <i />
          <i />
          <strong>f.</strong>
        </div>
      ) : c.kind === "voice" ? (
        <div className="ca-type-art">
          <span>{fixed ? "Go" : "ALL DAY."}</span>
          <strong>{fixed ? "gently." : "CRUSH IT."}</strong>
          <i />
        </div>
      ) : c.kind === "approval" ? (
        <div className="ca-seal">
          <FileCheck2 strokeWidth={0.8} />
          <span>
            HUMAN
            <br />
            IN THE LOOP
          </span>
        </div>
      ) : c.kind === "version" ? (
        <div className="ca-version-art">
          <i>01</i>
          <i>02</i>
          <i>03</i>
        </div>
      ) : (
        <div className="ca-bottle">
          <div className="ca-bottle-cap" />
          <div className="ca-bottle-body">
            <span>f.</span>
            <small>
              FORMA
              <br />
              HAND WASH
            </small>
            <i>250 ml</i>
          </div>
          <div className="ca-bottle-shadow" />
        </div>
      )}
      <div className="ca-claim-text">
        <strong>{fixed ? c.after : c.before}</strong>
        <span>
          {fixed && c.kind === "claim"
            ? "less plastic, by weight."
            : fixed && c.kind === "language"
              ? "de plastique en moins, en poids."
              : c.subtitle}
        </span>
      </div>
      <div className="ca-art-bottom">
        <span>{fixed ? c.note : "CAMPAIGN DRAFT — NOT APPROVED"}</span>
        <span>↗</span>
      </div>
    </div>
  );
}

export function LandingPage({
  logo,
  children,
  onExplore,
  demoAvailable,
  busy,
  error,
  standalone = false,
}: {
  logo: ReactNode;
  children: ReactNode;
  onExplore: () => void;
  demoAvailable: boolean;
  busy: boolean;
  error: string;
  standalone?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    story = useRef<HTMLElement>(null),
    robotHost = useRef<HTMLDivElement>(null),
    inspector = useRef<Inspector | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const books = useRef<(HTMLButtonElement | null)[]>([]);
  const state = useRef({
    target: 0,
    pos: 0,
    p: 0,
    scan: 0,
    manual: -1,
    paused: false,
    reduce: false,
    time: 0,
    drag: false,
    selected: 0,
    phase: 0,
  });
  const drag = useRef({
    x: 0,
    y: 0,
    start: 0,
    moved: false,
    last: 0,
    velocity: 0,
  });
  const [selected, setSelected] = useState(0),
    [phase, setPhase] = useState(0),
    [paused, setPaused] = useState(false),
    [decision, setDecision] = useState<Decision>("pending"),
    [corrected, setCorrected] = useState(false),
    [feature, setFeature] = useState(0),
    [robotReady, setRobotReady] = useState(false);
  const c = cases[selected];
  function choose(index: number) {
    state.current.target = index;
    state.current.manual = -1;
    setDecision("pending");
  }
  function go(progress: number) {
    if (!story.current) return;
    window.scrollTo({
      top:
        story.current.offsetTop +
        ((story.current.offsetHeight - window.innerHeight) * progress) / 5,
      behavior: state.current.reduce ? "instant" : "smooth",
    });
  }
  function inspectCase() {
    state.current.manual = -1;
    go(1.38);
  }
  function runScan() {
    state.current.manual = 0;
    setDecision("pending");
    go(2.45);
  }
  function openWorkspace() {
    dialog.current?.showModal();
  }
  useEffect(() => {
    let alive = true;
    import("./case-inspector").then(({ createInspector }) => {
      if (alive && robotHost.current) {
        try {
          inspector.current = createInspector(robotHost.current);
          setRobotReady(true);
        } catch {
          setRobotReady(false);
        }
      }
    });
    return () => {
      alive = false;
      inspector.current?.dispose();
      inspector.current = null;
    };
  }, []);
  useEffect(() => {
    const r = root.current,
      sec = story.current;
    if (!r || !sec) return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    state.current.reduce = mq.matches;
    const change = () => {
      state.current.reduce = mq.matches;
    };
    mq.addEventListener("change", change);
    let frame = 0,
      last = performance.now(),
      wasFixed = false;
    let W = document.documentElement.clientWidth,
      H = innerHeight,
      top = sec.offsetTop,
      distance = sec.offsetHeight - H;
    const measure = () => {
      W = document.documentElement.clientWidth;
      H = innerHeight;
      top = sec.offsetTop;
      distance = sec.offsetHeight - H;
    };
    window.addEventListener("resize", measure);
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = state.current,
        still = s.paused || s.reduce;
      const target = clamp((scrollY - top) / Math.max(1, distance)) * 5;
      s.p = mix(s.p, target, still ? 1 : 1 - Math.exp(-7 * dt));
      s.pos = mix(s.pos, s.target, still ? 1 : 1 - Math.exp(-9 * dt));
      if (!still) s.time += dt;
      const ix = mod(Math.round(s.pos), cases.length);
      if (ix !== s.selected) {
        s.selected = ix;
        setSelected(ix);
        s.manual = -1;
        setDecision("pending");
      }
      const p = s.p,
        zoom = smooth((p - 0.12) / 1.05),
        out = smooth((p - 4.75) / 0.25);
      const currentPhase =
        p < 0.65 ? 0 : p < 1.78 ? 1 : p < 2.95 ? 2 : p < 3.95 ? 3 : 4;
      if (currentPhase !== s.phase) {
        s.phase = currentPhase;
        setPhase(currentPhase);
      }
      if (s.manual >= 0) s.manual = Math.min(1, s.manual + dt * 0.4);
      const scanTarget = s.manual >= 0 ? s.manual : smooth((p - 1.75) / 0.95);
      s.scan = mix(s.scan, scanTarget, still ? 1 : 1 - Math.exp(-8 * dt));
      if (s.scan > 0.97 !== wasFixed) {
        wasFixed = s.scan > 0.97;
        setCorrected(wasFixed);
      }
      r.style.setProperty("--scan", `${s.scan * 100}%`);
      r.style.setProperty("--intro-shift", `${-smooth(p / 0.65) * 55}vh`);
      r.style.setProperty("--intro-clip", `${smooth(p / 0.65) * 100}%`);
      r.style.setProperty("--zoom", `${zoom}`);
      r.style.setProperty("--progress", `${(p / 5) * 100}%`);
      r.style.setProperty(
        "--scan-light",
        (p > 1.7 && p < 2.75) || (s.manual >= 0 && s.manual < 1) ? "1" : "0",
      );
      r.style.setProperty("--scene-exit", `${out * 8}vh`);
      const mobile = W < 760;
      const base = Math.min(mobile ? 245 : 320, H * (mobile ? 0.32 : 0.33));
      const scale = base / 320;
      const centerX = mix(W * 0.5, W * (mobile ? 0.5 : 0.325), zoom);
      const centerY = mix(
        H * (mobile ? 0.56 : 0.58),
        H * (mobile ? 0.4 : 0.51),
        zoom,
      );
      const chosenScale = mix(
        scale,
        Math.min(mobile ? 0.93 : 1.45, (H * (mobile ? 0.34 : 0.6)) / 320),
        zoom,
      );
      books.current.forEach((book, i) => {
        if (!book) return;
        const u = mod(i - s.pos + 3, 6) - 3,
          a = Math.abs(u),
          open = smooth(1 - a);
        const x = u * 83 * scale + Math.sign(u) * (1 - open) * 75 * scale;
        const shift = Math.sign(u) * zoom * (W * 0.9 + a * 40) * (1 - open);
        const y =
          (1 - open) * 12 + Math.sin(s.time * 0.45 + i) * 2 * (still ? 0 : 1);
        const angle = mix(72, 13, open) * (1 - zoom * 0.88);
        const z = open * 70 - zoom * a * 190;
        book.style.transform = `translate3d(${centerX + x + shift}px,${centerY + y - out * H * 0.08}px,${z}px) scale(${mix(scale, chosenScale, open)}) rotateY(${angle}deg) rotateZ(${open * mix(-4, 0, zoom)}deg)`;
        book.style.zIndex = String(Math.round(20 - a * 3));
        book.style.visibility = a > 2.95 ? "hidden" : "visible";
        book.style.setProperty("--open", String(open));
      });
      const botX = mix(
        W * (mobile ? 0.77 : 0.79),
        W * (mobile ? 0.78 : 0.53),
        zoom,
      );
      const botY = mix(
        H * (mobile ? 0.44 : 0.48),
        H * (mobile ? 0.4 : 0.43) + s.scan * H * 0.17,
        zoom,
      );
      const robot = r.querySelector<HTMLElement>(".ca-inspector");
      if (robot)
        robot.style.transform = `translate3d(${botX}px,${botY}px,0) rotate(${mix(8, -7, zoom)}deg)`;
      const inside = scrollY < top + sec.offsetHeight && scrollY + H > top;
      if (inside && !document.hidden)
        inspector.current?.update(s.time, p, s.scan, still);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      mq.removeEventListener("change", change);
    };
  }, []);
  const featureItems = [
    {
      tag: "01 / THE SOURCE OF TRUTH",
      title: "Every claim,\nsomething behind it.",
      body: "Connect approved documents to the words they support. See the source, its scope and the suggestion in one place.",
      word: "Evidence",
      type: "source",
    },
    {
      tag: "02 / YOUR BRAND, IN EVERY DETAIL",
      title: "Different formats.\nOne familiar feeling.",
      body: "Text, visuals and translations belong to the same brand. Bring their findings into one review, with the right context.",
      word: "Consistency",
      type: "brand",
    },
    {
      tag: "03 / PEOPLE MAKE THE CALL",
      title: "A clear decision.\nA complete story.",
      body: "Route the exact version for approval. Keep the source, the changes and the human decision connected as work moves forward.",
      word: "Confidence",
      type: "decision",
    },
  ];
  return (
    <div
      ref={root}
      className={`ca-page ca-phase-${phase} ${corrected ? "ca-corrected" : ""} ${paused ? "ca-paused" : ""}`}
    >
      <a className="ca-skip" href="#brandora-features">
        Skip animated story
      </a>
      <header className="ca-nav">
        <button
          className="ca-brand"
          onClick={() => go(0)}
          aria-label="Brandora home"
        >
          {logo}
        </button>
        <nav aria-label="Main navigation">
          <button onClick={() => go(0)}>The cases</button>
          <button onClick={() => go(1.4)}>How it works</button>
          <a href="#brandora-features">Why Brandora</a>
        </nav>
        <button className="ca-nav-cta" onClick={inspectCase}>
          Meet your inspector <ArrowUpRight size={15} />
        </button>
      </header>
      <section
        className="ca-story"
        ref={story}
        aria-label="Interactive Brandora case library"
      >
        <div className="ca-stage">
          <div className="ca-grain" aria-hidden="true" />
          <div className="ca-intro">
            <p className="ca-eyebrow">
              <i /> THE BRAND CARE DEPARTMENT
            </p>
            <h1>
              Good brands deserve
              <br />
              <em>better drafts.</em>
            </h1>
            <p className="ca-intro-description">
              A little off-brand. A little overstated. A little lost in
              translation.
              <br />
              {" "}
              Meet the AI workspace that helps your team put it right.
            </p>
          </div>
          <div className="ca-shelf-label">
            <span>THE CASE LIBRARY</span>
            <span>06 COMMON PROBLEMS. ONE CLEARER WAY FORWARD.</span>
          </div>
          <div className="ca-floor" aria-hidden="true" />
          <div
            className="ca-shelf"
            role="region"
            aria-label="Brand problem cases. Drag or use arrow keys."
            tabIndex={phase === 0 ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                choose(
                  state.current.target + (e.key === "ArrowRight" ? 1 : -1),
                );
              }
              if (e.key === "Enter") inspectCase();
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                start: state.current.target,
                moved: false,
                last: e.clientX,
                velocity: 0,
              };
              state.current.drag = true;
            }}
            onPointerMove={(e) => {
              if (!state.current.drag) return;
              const dx = e.clientX - drag.current.x;
              if (Math.abs(dx) > 8) {
                drag.current.moved = true;
                state.current.target = drag.current.start - dx / 160;
                drag.current.velocity = (drag.current.last - e.clientX) / 160;
                drag.current.last = e.clientX;
              }
            }}
            onPointerUp={() => {
              if (!state.current.drag) return;
              state.current.drag = false;
              if (drag.current.moved)
                choose(
                  Math.round(state.current.target + drag.current.velocity * 3),
                );
            }}
            onPointerCancel={() => {
              state.current.drag = false;
              choose(Math.round(state.current.target));
            }}
            onPointerLeave={() => {
              if (state.current.drag) {
                state.current.drag = false;
                choose(Math.round(state.current.target));
              }
            }}
          >
            {cases.map((item, i) => (
              <button
                key={item.kind}
                ref={(el) => {
                  books.current[i] = el;
                }}
                className={`ca-book ${i === selected ? "is-selected" : ""}`}
                style={
                  {
                    "--case-color": item.color,
                    "--case-ink": item.ink,
                  } as CSSProperties
                }
                aria-label={`${item.title}${i === selected ? ", selected" : ""}`}
                aria-pressed={i === selected}
                tabIndex={phase === 0 ? 0 : -1}
                onClick={() => {
                  if (drag.current.moved) return;
                  if (i === selected) inspectCase();
                  else
                    choose(
                      state.current.target +
                        mod(
                          i - mod(Math.round(state.current.target), 6) + 3,
                          6,
                        ) -
                        3,
                    );
                }}
              >
                <div className="ca-book-pages" />
                <div className="ca-book-spine">
                  <span>BRANDORA / CASE {String(i + 1).padStart(2, "0")}</span>
                  <strong>{item.title}</strong>
                  <span>↗</span>
                </div>
                <div className="ca-book-front">
                  <div className="ca-cover-label">
                    <span>CASE NO. {String(i + 1).padStart(2, "0")}</span>
                    <span>{item.category}</span>
                  </div>
                  <h2>{item.title}</h2>
                  <div className="ca-campaign">
                    <Artwork index={i} />
                    <div className="ca-campaign-fixed">
                      <Artwork index={i} fixed />
                    </div>
                    <div className="ca-scan-line" />
                    <div className="ca-target">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <div className="ca-cover-foot">
                    <span>BRANDORA FIELD NOTES</span>
                    <span>↗</span>
                  </div>
                </div>
                <div className="ca-book-back" />
              </button>
            ))}
          </div>
          <div className="ca-inspector" aria-hidden="true">
            <div ref={robotHost} className="ca-robot-canvas" />
            {!robotReady && (
              <div className="ca-robot-fallback">
                <i />
                <i />
              </div>
            )}
            <span>
              <i />
              {phase === 0
                ? "B—01 / ON THE CASE"
                : phase === 1
                  ? "READING THE SOURCE"
                  : phase === 2
                    ? corrected
                      ? "SUGGESTION READY"
                      : "INSPECTING THE DRAFT"
                    : "WAITING FOR YOU"}
            </span>
          </div>
          <div
            className="ca-case-caption"
            aria-hidden={phase !== 0}
            inert={phase !== 0}
          >
            <div className="ca-caption-mask" key={selected}>
              <span>
                CASE {String(selected + 1).padStart(2, "0")} / {c.category}
              </span>
              <strong>{c.title}</strong>
            </div>
            <div className="ca-shelf-controls">
              <button
                onClick={() => choose(Math.round(state.current.target) - 1)}
                aria-label="Previous case"
              >
                <ArrowLeft size={18} />
              </button>
              <span>DRAG TO DISCOVER</span>
              <button
                onClick={() => choose(Math.round(state.current.target) + 1)}
                aria-label="Next case"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
          <div
            className="ca-inspection-copy"
            aria-hidden={phase === 0}
            inert={phase === 0}
          >
            <div className="ca-case-mini">
              <span>CASE {String(selected + 1).padStart(2, "0")}</span>
              <button
                onClick={() => {
                  choose(Math.round(state.current.target) + 1);
                  go(1.4);
                }}
              >
                Next case <ArrowRight size={14} />
              </button>
            </div>
            <div
              className="ca-step-copy ca-check-copy"
              aria-hidden={phase > 2}
              inert={phase > 2}
            >
              <p className="ca-eyebrow">
                {phase === 1 ? "01 / FIND THE GAP" : "02 / PUT IT RIGHT"}
              </p>
              <h2>
                {phase === 1
                  ? c.headline
                  : corrected
                    ? "That’s more like your brand."
                    : "A closer look.\nA clearer draft."}
              </h2>
              <p>
                {phase === 1
                  ? c.description
                  : corrected
                    ? "The suggestion is ready, with its source attached. Your team still decides what makes the final version."
                    : c.finding}
              </p>
              <div className="ca-evidence">
                <div>
                  <Link2 size={16} />
                  <span>APPROVED SOURCE</span>
                  <Check size={14} />
                </div>
                <strong>{c.source}</strong>
                <p>{c.rule}</p>
              </div>
              <div className={`ca-result ${corrected ? "is-ready" : ""}`}>
                <span>
                  {corrected ? (
                    <CheckCheck size={17} />
                  ) : (
                    <span className="ca-small-target" />
                  )}
                </span>
                <p>{corrected ? c.fix : c.issue}</p>
              </div>
              <button
                className="ca-text-button"
                onClick={
                  corrected
                    ? () => {
                        state.current.manual = 0;
                        go(2.45);
                      }
                    : runScan
                }
              >
                {corrected ? "Run the check again" : "Watch the correction"}
                {corrected ? <RotateCcw size={15} /> : <ArrowRight size={16} />}
              </button>
            </div>
            <div
              className="ca-step-copy ca-review-copy"
              aria-hidden={phase !== 3}
              inert={phase !== 3}
            >
              <p className="ca-eyebrow">03 / THE HUMAN PART</p>
              <h2>
                Prepared by AI.
                <br />
                <em>Decided by you.</em>
              </h2>
              <p>
                Review the original, the suggestion and its source. Give this
                exact version the go-ahead, or send it back.
              </p>
              <div className="ca-review-record">
                <span>FORMA / CAMPAIGN V03</span>
                <strong>
                  {decision === "pending"
                    ? "Your decision is still needed."
                    : decision === "approved"
                      ? "You approved this version."
                      : "Changes requested."}
                </strong>
                <p>
                  {decision === "pending"
                    ? "The AI check is complete. Human approval is pending."
                    : decision === "approved"
                      ? "Your decision is linked to v03 and its evidence."
                      : "The draft stays open. The decision is kept in its history."}
                </p>
                <div className="ca-review-actions">
                  <button
                    onClick={() => setDecision("approved")}
                    disabled={decision === "approved"}
                  >
                    <Check size={16} />{" "}
                    {decision === "approved" ? "Approved" : "Approve version"}
                  </button>
                  <button onClick={() => setDecision("changes")}>
                    Request changes
                  </button>
                </div>
                {decision !== "pending" && (
                  <button
                    className="ca-reset"
                    onClick={() => setDecision("pending")}
                  >
                    Reset example
                  </button>
                )}
              </div>
              <small className="ca-example-label">
                Interactive example · No content is published.
              </small>
            </div>
            <div
              className="ca-step-copy ca-trail-copy"
              aria-hidden={phase !== 4}
              inert={phase !== 4}
            >
              <p className="ca-eyebrow">04 / KEEP THE WHOLE STORY</p>
              <h2>
                A clearer draft.
                <br />
                <em>A clear trail.</em>
              </h2>
              <p>
                Every source, suggestion, version and decision stays connected.
                That’s how brand care becomes a team habit.
              </p>
              <ol className="ca-trail">
                <li>
                  <span>01</span>
                  <div>
                    <strong>Original draft</strong>
                    <small>{c.before} · finding recorded</small>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Source-linked suggestion</strong>
                    <small>{c.source}</small>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Human decision</strong>
                    <small>
                      {decision === "approved"
                        ? "Approved by you in this example"
                        : decision === "changes"
                          ? "Changes requested by you"
                          : "Awaiting a reviewer — never auto-approved"}
                    </small>
                  </div>
                </li>
              </ol>
              <button className="ca-text-button" onClick={() => go(3.45)}>
                Return to the reviewer <ArrowLeft size={15} />
              </button>
            </div>
          </div>
          <div className="ca-bottom-bar">
            <button
              className="ca-scroll-cue"
              onClick={() => go(phase === 0 ? 1.4 : Math.min(4.5, phase + 1.4))}
            >
              <ArrowDown size={16} />
              <span>
                {phase === 0
                  ? "SCROLL TO OPEN A CASE"
                  : phase === 1
                    ? "SCROLL TO CHECK & CORRECT"
                    : phase === 2
                      ? "CONTINUE TO HUMAN REVIEW"
                      : "KEEP THE STORY MOVING"}
              </span>
            </button>
            <div
              className="ca-chapter-progress"
              aria-label={`Story step ${phase + 1} of 5`}
            >
              {["Discover", "Inspect", "Correct", "Approve", "Trace"].map(
                (label, i) => (
                  <button
                    key={label}
                    className={phase === i ? "active" : ""}
                    onClick={() => go(i === 0 ? 0 : i + 0.35)}
                    aria-label={`Go to ${label}`}
                    aria-current={phase === i ? "step" : undefined}
                  >
                    <i />
                    <span>{label}</span>
                  </button>
                ),
              )}
            </div>
            <button
              className="ca-pause"
              onClick={() => {
                state.current.paused = !paused;
                setPaused(!paused);
              }}
              aria-label={
                paused ? "Resume ambient motion" : "Pause ambient motion"
              }
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          </div>
        </div>
      </section>
      <section
        className={`ca-features ca-feature-${feature}`}
        id="brandora-features"
        aria-label="Brandora features"
      >
        <div className="ca-feature-heading">
          <p className="ca-eyebrow">BUILT FOR THE WHOLE BRAND</p>
          <p>
            From the first draft
            <br />
            to the final yes.
          </p>
        </div>
        <div
          className="ca-feature-window"
          onTouchStart={(e) => {
            drag.current.x = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - drag.current.x;
            if (Math.abs(dx) > 40)
              setFeature(mod(feature + (dx < 0 ? 1 : -1), 3));
          }}
        >
          <div
            className="ca-feature-track"
            style={{ transform: `translateX(-${feature * 100}%)` }}
          >
            {featureItems.map((item, i) => (
              <article
                className="ca-feature-slide"
                key={item.type}
                aria-hidden={feature !== i}
                inert={feature !== i}
              >
                <div className="ca-feature-word" aria-hidden="true">
                  {item.word}
                </div>
                <div
                  className={`ca-feature-object ca-object-${item.type}`}
                  aria-hidden="true"
                >
                  {i === 0 ? (
                    <>
                      <div className="ca-source-sheet">
                        <span>APPROVED RESEARCH</span>
                        <strong>
                          30<em>%</em>
                        </strong>
                        <p>less plastic by weight</p>
                        <i />
                        <i />
                        <i />
                        <small>
                          PACKAGING STUDY / §2.4 <Check size={14} />
                        </small>
                      </div>
                      <div className="ca-source-link">
                        <Link2 size={25} />
                      </div>
                      <div className="ca-source-note">
                        <span>YOUR CAMPAIGN</span>
                        <strong>
                          A promise
                          <br />
                          with proof.
                        </strong>
                        <small>
                          SOURCE CONNECTED <Check size={12} />
                        </small>
                      </div>
                    </>
                  ) : i === 1 ? (
                    <>
                      <div className="ca-brand-poster">
                        <span>FORMA®</span>
                        <strong>
                          Go
                          <br />
                          <em>gently.</em>
                        </strong>
                        <div className="ca-poster-circle" />
                        <small>EVERYDAY, CONSIDERED.</small>
                      </div>
                      <div className="ca-brand-swatch">
                        <span>THE PALETTE</span>
                        <i />
                        <i />
                        <i />
                        <small>ONE SHARED LANGUAGE</small>
                      </div>
                      <div className="ca-language-note">
                        EN → FR
                        <br />
                        <strong>
                          Go gently.
                          <br />
                          <em>Tout en douceur.</em>
                        </strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="ca-decision-sheet">
                        <span>REVIEW RECORD / V03</span>
                        <div className="ca-decision-stamp">
                          <Check size={50} />
                        </div>
                        <strong>
                          The final
                          <br />
                          <em>word is yours.</em>
                        </strong>
                        <small>Source → Suggestion → Your decision</small>
                      </div>
                      <div className="ca-version-tag">
                        <span>v01</span>
                        <span>v02</span>
                        <strong>
                          v03 <Check size={16} />
                        </strong>
                      </div>
                    </>
                  )}
                </div>
                <div className="ca-feature-copy">
                  <p className="ca-eyebrow">{item.tag}</p>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                  <button
                    className="ca-text-button"
                    onClick={() => {
                      choose(i === 0 ? 0 : i === 1 ? 2 : 4);
                      go(i === 2 ? 3.4 : 1.4);
                    }}
                  >
                    Explore this case <ArrowUpRight size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="ca-feature-control">
          <span>ONE WORKSPACE. A SHARED STANDARD.</span>
          <div>
            {featureItems.map((item, i) => (
              <button
                key={item.type}
                aria-label={`Show ${item.word}`}
                aria-pressed={feature === i}
                onClick={() => setFeature(i)}
                className={feature === i ? "active" : ""}
              >
                <span>0{i + 1}</span>
              </button>
            ))}
          </div>
          <div>
            <button
              aria-label="Previous feature"
              onClick={() => setFeature(mod(feature - 1, 3))}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              aria-label="Next feature"
              onClick={() => setFeature(mod(feature + 1, 3))}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <footer className="ca-footer">
        <p className="ca-eyebrow">ACCURATE. CONSISTENT. ACCOUNTED FOR.</p>
        <h2>
          Let’s put your brand
          <br />
          <em>in good hands.</em>
        </h2>
        <button
          className="ca-primary"
          disabled={busy}
          onClick={() => standalone ? go(0) : (demoAvailable ? onExplore() : openWorkspace())}
        >
          {busy
            ? "Opening workspace…"
            : standalone ? "Explore another case" : demoAvailable
              ? "Explore the workspace"
              : "Open your workspace"}
          <ArrowUpRight size={19} />
        </button>
        {error && <p role="alert">{error}</p>}
        <div className="ca-footer-bottom">
          <span>brandora.</span>
          <span>AI ASSISTS. PEOPLE DECIDE.</span>
          <button onClick={() => go(0)}>Back to the cases ↑</button>
        </div>
      </footer>
      {!standalone && <dialog
        className="ca-dialog"
        ref={dialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <button
          aria-label="Close workspace sign in"
          className="ca-dialog-close"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        {children}
      </dialog>}
      <div className="ca-sr" aria-live="polite">
        {c.title}.{" "}
        {corrected ? "Correction ready for human review." : "Draft selected."}
      </div>
    </div>
  );
}
