"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LazyMotion,
  domAnimation,
  m,
  MotionConfig,
  useReducedMotion,
  useInView,
  useSpring,
} from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  FileCheck2,
  Fingerprint,
  GitBranch,
  Languages,
  Link2,
  Loader2,
  LockKeyhole,
  MousePointer2,
  Pause,
  Play,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import "./landing.css";

const stages = [
  {
    name: "Source",
    label: "Start with something you can stand behind.",
    detail:
      "Approved facts and brand rules give every review a shared reference.",
  },
  {
    name: "Review",
    label: "Find the gap. Keep the context.",
    detail:
      "Connect a finding to its evidence, then give the next decision to a person.",
  },
  {
    name: "Approve",
    label: "A human decision. An exact version.",
    detail:
      "Keep the content, source versions and approval together in one receipt.",
  },
];

const capabilities = [
  {
    name: "AI review",
    icon: Sparkles,
    title: "A second pair of eyes.\nWith the evidence attached.",
    description:
      "Check your message against approved sources and brand rules. Inspect the reasoning, resolve findings, and let your reviewer make the final call.",
    tag: "CONTEXT, NOT GUESSWORK",
  },
  {
    name: "Visual checks",
    icon: ScanLine,
    title: "Your brand speaks\nin more than words.",
    description:
      "Extract text from images and scanned PDFs. Compare a logo with your approved reference, then review the findings before using them.",
    tag: "SEE THE WHOLE MESSAGE",
  },
  {
    name: "Translation",
    icon: Languages,
    title: "A new language.\nThe same promise.",
    description:
      "Translate your content while preserving names, numbers and protected facts. Use a back-translation to review meaning before approval.",
    tag: "MEANING THAT TRAVELS",
  },
];

function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <m.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}

function EvidenceSculpture({
  stage,
  moving,
}: {
  stage: number;
  moving: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const inView = useInView(frame, { margin: "100px" });
  const bounds = useRef<DOMRect | null>(null);
  const rotateX = useSpring(9, { stiffness: 100, damping: 24 });
  const rotateY = useSpring(-13, { stiffness: 100, damping: 24 });
  useEffect(() => {
    if (moving) {
      rotateX.set(9);
      rotateY.set(-13);
    } else {
      rotateX.jump(0);
      rotateY.jump(0);
    }
  }, [moving, rotateX, rotateY]);

  return (
    <div
      className="lp-sculpture"
      ref={frame}
      data-stage={stage}
      data-visible={inView}
      onPointerEnter={() => {
        bounds.current = frame.current?.getBoundingClientRect() ?? null;
      }}
      onPointerMove={(event) => {
        if (!moving || event.pointerType !== "mouse" || !bounds.current) return;
        const box = bounds.current;
        rotateX.set(9 - ((event.clientY - box.top) / box.height - 0.5) * 12);
        rotateY.set(-13 + ((event.clientX - box.left) / box.width - 0.5) * 18);
      }}
      onPointerLeave={() => {
        rotateX.set(moving ? 9 : 0);
        rotateY.set(moving ? -13 : 0);
      }}
    >
      <div className="lp-orbit lp-orbit-one" aria-hidden="true" />
      <div className="lp-orbit lp-orbit-two" aria-hidden="true" />
      <div className="lp-orbit-point" aria-hidden="true" />
      <div className="lp-sculpture-scale">
        <m.div
          className="lp-planes"
          style={{ rotateX, rotateY }}
          aria-hidden="true"
        >
          <div className="lp-float">
            <div className="lp-plane lp-source-plane">
              <div className="lp-specimen-bar">
                <span>
                  <BookOpen size={15} /> THE SOURCE OF TRUTH
                </span>
                <span>01</span>
              </div>
              <div className="lp-source-title">The facts come first.</div>
              <div className="lp-source-row">
                <span>Launch guide</span>
                <span>
                  Version 2.0 <Check size={12} />
                </span>
              </div>
              <div className="lp-source-rule" />
              <div className="lp-source-rule short" />
              <div className="lp-source-seal">
                <span /> Approved reference
              </div>
            </div>
            <div className="lp-plane lp-draft-plane">
              <div className="lp-specimen-bar">
                <span>
                  <FileCheck2 size={15} /> A MESSAGE WITH MEANING
                </span>
                <span>02</span>
              </div>
              <div className="lp-paper-title">
                Make a promise.
                <br />
                <em>Keep it grounded.</em>
              </div>
              <p>Every claim deserves a clear source.</p>
              <div className="lp-claim-line">
                <span>Evidence linked</span>
                <Link2 size={15} />
                <span>Launch guide · v2</span>
              </div>
              <div className="lp-paper-bottom">
                <span>
                  <span /> Brand voice checked
                </span>
                <span>Ready for a human</span>
              </div>
            </div>
            <div className="lp-plane lp-receipt-plane">
              <span className="lp-approval-icon">
                <ShieldCheck size={25} strokeWidth={1.5} />
              </span>
              <div>
                <span className="lp-tiny">THE FINAL WORD IS YOURS</span>
                <strong>Human approved.</strong>
                <span className="lp-receipt-caption">
                  Signed to this exact version <CheckCheck size={14} />
                </span>
              </div>
            </div>
            <div className="lp-thread-tag">
              <GitBranch size={16} />
              <span>One connected story</span>
            </div>
          </div>
        </m.div>
      </div>
      <div className="lp-scene-label">
        <span className="lp-scene-cross">+</span> INTERACTIVE PRODUCT
        ILLUSTRATION <span>01—03</span>
      </div>
    </div>
  );
}

function CapabilityPreview({ index }: { index: number }) {
  return (
    <div
      className="lp-cap-preview"
      aria-label={`${capabilities[index].name} illustrative preview`}
    >
      <div className="lp-preview-bar">
        <span>
          <span />
          <span />
          <span />
        </span>
        <span>BRANDORA / {capabilities[index].name.toUpperCase()}</span>
        <LockKeyhole size={13} />
      </div>
      {index === 0 && (
        <div className="lp-review-preview">
          <div className="lp-preview-eyebrow">
            LAUNCH COPY <span>Illustrative example</span>
          </div>
          <p>
            A thoughtful start.
            <br />A message <mark>you can trust.</mark>
          </p>
          <div className="lp-finding">
            <span className="lp-feature-symbol">
              <Link2 size={20} />
            </span>
            <div>
              <strong>Show what supports the claim</strong>
              <span>Link an approved source before requesting review.</span>
            </div>
            <ArrowUpRight size={18} />
          </div>
          <div className="lp-preview-foot">
            <span>
              <Fingerprint size={15} /> Evidence stays connected
            </span>
            <span>Human review required</span>
          </div>
        </div>
      )}
      {index === 1 && (
        <div className="lp-vision-preview">
          <div className="lp-scan-art">
            <span className="lp-scan-corner one" />
            <span className="lp-scan-corner two" />
            <span className="lp-scan-corner three" />
            <span className="lp-scan-corner four" />
            <div className="lp-scan-line" />
            <div className="lp-sample-brand">
              b<span>.</span>
            </div>
            <strong>
              A little clarity.
              <br />A lasting impression.
            </strong>
            <small>SAMPLE CREATIVE</small>
          </div>
          <div className="lp-scan-findings">
            <span>
              <ScanLine size={15} /> Text extraction
            </span>
            <p>
              “A little clarity.
              <br />A lasting impression.”
            </p>
            <span>
              <ShieldCheck size={15} /> Logo comparison
            </span>
            <p>
              Compare with your
              <br />
              approved brand asset.
            </p>
            <small>Illustrative example</small>
          </div>
        </div>
      )}
      {index === 2 && (
        <div className="lp-translation-preview">
          <div className="lp-language-row">
            <span>English</span>
            <ArrowRight size={17} />
            <span lang="hi">हिन्दी</span>
          </div>
          <div className="lp-language-text">
            <small>ORIGINAL MESSAGE</small>
            <p>
              Every word.
              <br />
              Still your brand.
            </p>
          </div>
          <div className="lp-language-output">
            <Languages size={20} />
            <p lang="hi">
              हर शब्द।
              <br />
              आपके ब्रांड की पहचान।
            </p>
          </div>
          <div className="lp-preview-foot">
            <span>
              <LockKeyhole size={14} /> Protected facts
            </span>
            <span>Review the back-translation</span>
          </div>
        </div>
      )}
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
}: {
  logo: ReactNode;
  children: ReactNode;
  onExplore: () => void;
  demoAvailable: boolean;
  busy: boolean;
  error: string;
}) {
  const [stage, setStage] = useState(1);
  const [feature, setFeature] = useState(0);
  const [paused, setPaused] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  const moving = !paused && !reduced && pageVisible && !authOpen;

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!authOpen) return;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, [authOpen]);

  function openWorkspace() {
    setAuthOpen(true);
  }
  function explore() {
    if (demoAvailable) onExplore();
    else openWorkspace();
  }
  const cta = busy
    ? "Opening demo…"
    : demoAvailable
      ? "Explore demo"
      : "Open workspace";

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={paused ? "always" : "user"}>
        <div className="lp" data-motion={moving ? "on" : "off"}>
          <a className="lp-skip" href="#landing-main">
            Skip to content
          </a>
          <header className="lp-header">
            <a className="lp-brand" href="#" aria-label="Brandora home">
              {logo}
            </a>
            <nav className="lp-nav" aria-label="Main navigation">
              <a href="#workflow">The workflow</a>
              <a href="#intelligence">Intelligence</a>
            </nav>
            <div className="lp-header-actions">
              <button className="lp-signin" onClick={openWorkspace}>
                Sign in <ArrowUpRight size={15} aria-hidden="true" />
              </button>
              <button
                className="lp-button lp-button-small"
                disabled={busy}
                onClick={explore}
              >
                {cta}
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </div>
          </header>
          <main className="lp-main" id="landing-main">
            <section className="lp-hero" aria-labelledby="landing-title">
              <div className="lp-hero-light" aria-hidden="true" />
              <div className="lp-hero-copy">
                <m.div
                  className="lp-eyebrow"
                  initial={false}
                  animate={{ opacity: 1 }}
                >
                  <span /> CLARITY IS YOUR COMPETITIVE EDGE
                </m.div>
                <m.h1
                  id="landing-title"
                  initial={reduced ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                >
                  Your brand.
                  <br />
                  Every word.
                  <br />
                  <em>Backed by truth.</em>
                </m.h1>
                <m.div
                  initial={reduced ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.8,
                    delay: 0.12,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <p className="lp-hero-description">
                    A clear path from the things you say to the sources that
                    support them. Create, check, and approve with confidence.
                  </p>
                  <div className="lp-hero-actions">
                    <button
                      className="lp-button"
                      onClick={explore}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2
                          size={18}
                          className="spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="lp-button-dot" />
                      )}
                      {cta}
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </button>
                    <a className="lp-text-link" href="#workflow">
                      See how it works{" "}
                      <ArrowDown size={16} aria-hidden="true" />
                    </a>
                  </div>
                  <p className="lp-access-note">
                    <span />
                    {demoAvailable
                      ? "No sign-up. Your own sample workspace."
                      : "Your content. Your evidence. Your workspace."}
                  </p>
                  {error && !authOpen && (
                    <div className="lp-entry-error" role="alert">
                      {error}
                    </div>
                  )}
                </m.div>
              </div>
              <div className="lp-hero-object">
                <EvidenceSculpture stage={stage} moving={moving} />
                <div
                  className="lp-stage-switch"
                  role="group"
                  aria-label="Explore the evidence journey"
                >
                  {stages.map((item, index) => (
                    <button
                      key={item.name}
                      aria-pressed={stage === index}
                      onClick={() => setStage(index)}
                    >
                      <span>0{index + 1}</span>
                      {item.name}
                      {stage === index && <span className="lp-stage-dot" />}
                    </button>
                  ))}
                </div>
                <p className="lp-stage-description" aria-live="polite">
                  {stages[stage].label}
                </p>
              </div>
              <div className="lp-hero-baseline">
                <span>
                  <MousePointer2 size={14} aria-hidden="true" /> Move over the
                  cards. Follow the evidence.
                </span>
                <button
                  className="lp-motion-toggle"
                  aria-pressed={paused || !!reduced}
                  onClick={() => setPaused(!paused)}
                  disabled={!!reduced}
                >
                  {moving ? (
                    <Pause size={13} aria-hidden="true" />
                  ) : (
                    <Play size={13} aria-hidden="true" />
                  )}
                  {reduced
                    ? "Reduced motion"
                    : paused
                      ? "Resume motion"
                      : "Pause motion"}
                </button>
              </div>
            </section>

            <div className="lp-principles" aria-label="Brandora principles">
              <span>
                <GitBranch size={19} aria-hidden="true" /> Evidence, connected.
              </span>
              <span>
                <ScanLine size={19} aria-hidden="true" /> Every detail,
                considered.
              </span>
              <span>
                <ShieldCheck size={19} aria-hidden="true" /> People, in control.
              </span>
            </div>

            <section
              className="lp-workflow lp-section"
              id="workflow"
              aria-labelledby="workflow-title"
            >
              <Reveal className="lp-section-heading">
                <div>
                  <span className="lp-eyebrow">01 / THE WORKFLOW</span>
                  <h2 id="workflow-title">
                    Good work has
                    <br />
                    <em>a clear thread.</em>
                  </h2>
                </div>
                <p>
                  From a first draft to a final decision, keep the message and
                  its evidence in the same conversation.
                </p>
              </Reveal>
              <div className="lp-workflow-grid">
                {stages.map((item, index) => {
                  const Icon = [BookOpen, GitBranch, ShieldCheck][index];
                  return (
                    <Reveal className="lp-workflow-item" key={item.name}>
                      <div className="lp-step-top">
                        <span>0{index + 1}</span>
                        <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
                      </div>
                      <h3>
                        {
                          [
                            "Give your brand a foundation.",
                            "Make every review meaningful.",
                            "Put a person behind the promise.",
                          ][index]
                        }
                      </h3>
                      <p>{item.detail}</p>
                      <div className="lp-step-end">
                        <span>
                          {
                            [
                              "Sources + brand rules",
                              "Findings + clear next steps",
                              "Versioned approval receipts",
                            ][index]
                          }
                        </span>
                        {index < 2 ? (
                          <ArrowRight size={17} aria-hidden="true" />
                        ) : (
                          <CheckCheck size={17} aria-hidden="true" />
                        )}
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </section>

            <section
              className="lp-intelligence lp-section"
              id="intelligence"
              aria-labelledby="intelligence-title"
            >
              <Reveal className="lp-section-heading">
                <div>
                  <span className="lp-eyebrow">
                    02 / A LITTLE MORE PERSPECTIVE
                  </span>
                  <h2 id="intelligence-title">
                    Thoughtful intelligence.
                    <br />
                    <em>Human judgment.</em>
                  </h2>
                </div>
                <p>
                  Words, visuals, and languages. Bring more of your brand into
                  the same review workflow.
                </p>
              </Reveal>
              <div className="lp-capabilities">
                <div
                  className="lp-cap-tabs"
                  role="tablist"
                  aria-label="Intelligence capabilities"
                >
                  {capabilities.map((item, index) => (
                    <button
                      key={item.name}
                      id={`cap-tab-${index}`}
                      role="tab"
                      aria-selected={feature === index}
                      aria-controls="cap-panel"
                      tabIndex={feature === index ? 0 : -1}
                      onClick={() => setFeature(index)}
                      onKeyDown={(event) => {
                        let next = index;
                        if (event.key === "ArrowRight")
                          next = (index + 1) % capabilities.length;
                        else if (event.key === "ArrowLeft")
                          next =
                            (index + capabilities.length - 1) %
                            capabilities.length;
                        else if (event.key === "Home") next = 0;
                        else if (event.key === "End")
                          next = capabilities.length - 1;
                        else return;
                        event.preventDefault();
                        setFeature(next);
                        document.getElementById(`cap-tab-${next}`)?.focus();
                      }}
                    >
                      <item.icon size={17} aria-hidden="true" />
                      {item.name}
                      <span>0{index + 1}</span>
                    </button>
                  ))}
                </div>
                <div
                  role="tabpanel"
                  id="cap-panel"
                  aria-labelledby={`cap-tab-${feature}`}
                  tabIndex={0}
                  className="lp-cap-panel"
                >
                  <m.div
                    key={feature}
                    className="lp-cap-content"
                    initial={reduced || paused ? false : { opacity: 0, y: 9 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <div className="lp-cap-copy">
                      <span className="lp-eyebrow">
                        {capabilities[feature].tag}
                      </span>
                      <h3>{capabilities[feature].title}</h3>
                      <p>{capabilities[feature].description}</p>
                      <button
                        className="lp-text-link"
                        onClick={explore}
                        disabled={busy}
                      >
                        Try it in your workspace{" "}
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </button>
                      <small>
                        External AI is optional. Enable it in workspace
                        settings.
                      </small>
                    </div>
                    <CapabilityPreview index={feature} />
                  </m.div>
                </div>
              </div>
            </section>

            <section className="lp-final" aria-labelledby="demo-title">
              <Reveal>
                <span className="lp-eyebrow">
                  YOUR NEXT GOOD DECISION STARTS HERE
                </span>
                <h2 id="demo-title">
                  Less second-guessing.
                  <br />
                  <em>More standing behind it.</em>
                </h2>
                <p>
                  Step into Brandora. Create a draft. Switch to reviewer.
                  <br />
                  Follow the whole story, from source to sign-off.
                </p>
                <button className="lp-button" disabled={busy} onClick={explore}>
                  {cta}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </button>
                <span className="lp-final-note">
                  {demoAvailable
                    ? "Sample data · Four roles · A separate demo workspace"
                    : "An evidence-driven workspace for your brand"}
                </span>
              </Reveal>
              <div className="lp-final-orbit" aria-hidden="true" />
            </section>
          </main>
          <footer className="lp-footer">
            <a className="lp-brand" href="#" aria-label="Brandora home">
              {logo}
            </a>
            <p>A clear path from claim to confidence.</p>
            <button className="lp-signin" onClick={openWorkspace}>
              Your workspace <ArrowUpRight size={14} aria-hidden="true" />
            </button>
            <span>BRANDORA / 2026</span>
          </footer>
          <dialog
            ref={dialog}
            className="lp-auth"
            aria-labelledby="brandora-auth-title"
            onClose={() => setAuthOpen(false)}
            onClick={(event) => {
              if (event.target === event.currentTarget) setAuthOpen(false);
            }}
          >
            <div className="lp-auth-inner">
              <button
                className="lp-auth-close"
                onClick={() => setAuthOpen(false)}
                aria-label="Close sign in"
              >
                <X size={20} />
              </button>
              {children}
              <div className="lp-auth-note">
                <LockKeyhole size={15} aria-hidden="true" />
                <p>
                  Rules-only by default. External AI is enabled by your
                  workspace manager.
                </p>
              </div>
            </div>
          </dialog>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
