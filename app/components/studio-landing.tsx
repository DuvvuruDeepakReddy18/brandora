"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  GitBranch,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import type { StudioController } from "./studio-scene";
import "./studio-landing.css";

const chapters = [
  {
    name: "Meet the team",
    tag: "A LITTLE INTELLIGENCE. A LOT OF CARE.",
    line: "Your brand.",
    emphasis: "In good hands.",
    description:
      "Keep brand content accurate and consistent—with AI checks, approved sources and your team’s final say.",
    detail: "Three specialists. One shared understanding of your brand.",
  },
  {
    name: "Check the claim",
    tag: "01 / ACCURACY STARTS WITH EVIDENCE",
    line: "Big claims.",
    emphasis: "Meet the facts.",
    description:
      "A confident sentence needs something behind it. Connect your claims to approved sources and see where they don’t agree.",
    detail: "The draft says 50%. The approved study supports 30%.",
  },
  {
    name: "Keep it on-brand",
    tag: "02 / THE DETAILS MAKE THE DIFFERENCE",
    line: "Same voice.",
    emphasis: "Every detail.",
    description:
      "Your words, colours and logo should tell the same story. Bring text and visual findings together, then review the suggested changes.",
    detail: "A claim corrected. A palette aligned. A logo checked.",
  },
  {
    name: "Align the meaning",
    tag: "03 / A NEW LANGUAGE. THE SAME PROMISE.",
    line: "Across languages.",
    emphasis: "Still your brand.",
    description:
      "Keep names, numbers and meaning close to the original. Review translations alongside their source and a back-translation.",
    detail: "The same 30% claim, with its context intact.",
  },
  {
    name: "The human say",
    tag: "04 / THE FINAL WORD IS YOURS",
    line: "AI assists.",
    emphasis: "You decide.",
    description:
      "The team has done its checks. Now a person reviews the suggestions, asks for changes or approves this exact version.",
    detail: "Try the reviewer’s seat in this illustrative campaign.",
  },
  {
    name: "The whole story",
    tag: "05 / NOTHING GETS LOST ALONG THE WAY",
    line: "Every version.",
    emphasis: "A clear thread.",
    description:
      "Keep the source, the changes and the human decision connected. So the next person knows what changed, who decided and why.",
    detail: "From the first draft to the final decision. All connected.",
  },
];
type Decision = "pending" | "approved" | "changes";

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
  const story = useRef<HTMLElement>(null),
    mount = useRef<HTMLDivElement>(null);
  const copies = useRef<(HTMLDivElement | null)[]>([]),
    bar = useRef<HTMLDivElement>(null);
  const progress = useRef(0),
    disabled = useRef(false),
    decisionRef = useRef<Decision>("pending");
  const [active, setActive] = useState(0),
    [ready, setReady] = useState(false),
    [fallback, setFallback] = useState(false);
  const [paused, setPaused] = useState(false),
    [reduced, setReduced] = useState(false);
  const [decision, setDecision] = useState<Decision>("pending"),
    [authOpen, setAuthOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    authTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    disabled.current = paused || reduced || authOpen;
  }, [paused, reduced, authOpen]);
  useEffect(() => {
    decisionRef.current = decision;
  }, [decision]);
  useEffect(() => {
    let disposed = false,
      studio: StudioController | null = null;
    const element = mount.current;
    if (!element) return;
    import("./studio-scene")
      .then(({ createStudio }) =>
        createStudio(element, {
          progress: () => progress.current,
          reduced: () => disabled.current,
          decision: () => decisionRef.current,
          onReady: () => {
            if (!disposed) setReady(true);
          },
          onError: () => {
            if (!disposed) setFallback(true);
          },
        }),
      )
      .then((value) => {
        if (disposed) value?.dispose();
        else studio = value;
      })
      .catch(() => {
        if (!disposed) setFallback(true);
      });
    return () => {
      disposed = true;
      studio?.dispose();
    };
  }, []);
  useEffect(() => {
    const section = story.current;
    if (!section) return;
    let frame = 0,
      current = 0,
      previous = 0,
      lastActive = -1;
    let top = 0,
      distance = 1;
    const measure = () => {
      top = section.getBoundingClientRect().top + scrollY;
      distance = Math.max(1, section.offsetHeight - innerHeight);
    };
    measure();
    const animate = (now: number) => {
      const dt = Math.min((now - previous) / 1000 || 0.016, 0.05);
      previous = now;
      const target = Math.max(0, Math.min(5, ((scrollY - top) / distance) * 5));
      current +=
        (target - current) * (disabled.current ? 1 : 1 - Math.exp(-dt * 7));
      progress.current = current;
      const index = Math.min(5, Math.round(current));
      if (index !== lastActive) {
        setActive(index);
        lastActive = index;
      }
      copies.current.forEach((node, i) => {
        if (!node) return;
        const delta = current - i,
          opacity = Math.max(0, 1 - Math.abs(delta) * 1.8);
        node.style.opacity = String(opacity);
        node.style.visibility = opacity < 0.001 ? "hidden" : "visible";
        node.style.transform = disabled.current
          ? "none"
          : `translateY(${-delta * 28}px)`;
        node.style.pointerEvents = i === index ? "auto" : "none";
      });
      if (bar.current) bar.current.style.transform = `scaleX(${current / 5})`;
      frame = requestAnimationFrame(animate);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    window.addEventListener("resize", measure);
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useEffect(() => {
    if (!authOpen) return;
    const element = dialog.current,
      overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      authTrigger.current?.focus();
    };
  }, [authOpen]);
  function openWorkspace() {
    authTrigger.current = document.activeElement as HTMLElement;
    setAuthOpen(true);
  }
  function explore() {
    if (demoAvailable) onExplore();
    else openWorkspace();
  }
  function goTo(index: number) {
    if (!story.current) return;
    const top = story.current.getBoundingClientRect().top + scrollY;
    window.scrollTo({
      top: top + ((story.current.offsetHeight - innerHeight) * index) / 5,
      behavior: reduced || paused ? "instant" : "smooth",
    });
  }
  const cta = busy
    ? "Opening demo…"
    : demoAvailable
      ? "Explore demo"
      : "Open workspace";
  return (
    <div className="studio-page" data-reduced={reduced || paused}>
      <a className="st-skip" href="#studio-details">
        Skip the animation
      </a>
      <header className="st-header">
        <a
          className="st-logo"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goTo(0);
          }}
          aria-label="Brandora home"
        >
          {logo}
        </a>
        <nav aria-label="Main navigation">
          <button onClick={() => goTo(1)}>How it works</button>
          <a href="#studio-details">Built for your brand</a>
        </nav>
        <div className="st-header-actions">
          <button className="st-signin" onClick={openWorkspace}>
            Sign in <ArrowUpRight size={14} />
          </button>
          <button
            className="st-button st-small"
            onClick={explore}
            disabled={busy}
          >
            {cta}
            <ArrowUpRight size={15} />
          </button>
        </div>
      </header>
      <main>
        <section
          className="st-story"
          ref={story}
          aria-label="Follow a campaign through Brandora"
        >
          <div className="st-sticky">
            <div className="st-ambient" aria-hidden="true" />
            <div
              className="st-scene"
              ref={mount}
              data-ready={ready && !fallback}
              aria-hidden="true"
            />
            {(!ready || fallback) && (
              <div className="st-fallback" aria-hidden="true">
                <div className="st-mini-robot">
                  <span />
                  <span />
                </div>
                <div className="st-fallback-paper">
                  <small>FORMA / CAMPAIGN REVIEW</small>
                  <strong>
                    A little lighter.
                    <br />A lot more considered.
                  </strong>
                  <span>Sources → Checks → Human review</span>
                </div>
                <small>
                  {fallback
                    ? "Follow the campaign below"
                    : "Getting the studio ready…"}
                </small>
              </div>
            )}
            <div className="st-copy-area">
              {chapters.map((chapter, i) => (
                <div
                  className="st-chapter"
                  key={chapter.name}
                  ref={(el) => {
                    copies.current[i] = el;
                  }}
                  aria-hidden={active !== i}
                  inert={active !== i}
                  style={{
                    opacity: i === 0 ? 1 : 0,
                    visibility: i === 0 ? "visible" : "hidden",
                  }}
                >
                  <span className="st-eyebrow">
                    <i />
                    {chapter.tag}
                  </span>
                  {i === 0 ? (
                    <h1>
                      {chapter.line}
                      <br />
                      <em>{chapter.emphasis}</em>
                    </h1>
                  ) : (
                    <h2>
                      {chapter.line}
                      <br />
                      <em>{chapter.emphasis}</em>
                    </h2>
                  )}
                  <p className="st-description">{chapter.description}</p>
                  {i === 0 ? (
                    <>
                      <div className="st-hero-actions">
                        <button
                          className="st-button"
                          onClick={explore}
                          disabled={busy}
                        >
                          {cta}
                          <ArrowUpRight size={18} />
                        </button>
                        <button className="st-watch" onClick={() => goTo(1)}>
                          Follow a campaign <ArrowDown size={16} />
                        </button>
                      </div>
                      <p className="st-access-note">
                        {demoAvailable
                          ? "No sign-up. Your own sample workspace."
                          : "Your content. Your evidence. Your workspace."}
                      </p>
                    </>
                  ) : i === 4 ? (
                    <div
                      className="st-review"
                      aria-label="Illustrative human approval"
                    >
                      <span className="st-review-label">
                        <span className="st-avatar">You</span>Human reviewer{" "}
                        {decision === "pending" ? (
                          <span>Sample v3</span>
                        ) : (
                          <button
                            className="st-reset"
                            onClick={() => setDecision("pending")}
                          >
                            <RotateCcw size={12} />
                            Reset example
                          </button>
                        )}
                      </span>
                      <div className="st-review-actions">
                        <button
                          className="st-button"
                          disabled={decision === "approved"}
                          onClick={() => setDecision("approved")}
                        >
                          <Check size={16} />
                          {decision === "approved"
                            ? "Sample approved"
                            : "Approve sample"}
                        </button>
                        <button
                          className="st-secondary"
                          onClick={() => setDecision("changes")}
                          disabled={decision === "changes"}
                        >
                          Request changes
                        </button>
                      </div>
                      <span className="st-decision" role="status">
                        {decision === "approved"
                          ? "Your decision is attached to version 3."
                          : decision === "changes"
                            ? "Sent back with your request. The decision is recorded."
                            : "A sample interaction. Your workspace is untouched."}
                      </span>
                    </div>
                  ) : (
                    <div className="st-chapter-detail">
                      {i === 1 ? (
                        <Link2 size={16} />
                      ) : i === 5 ? (
                        <GitBranch size={16} />
                      ) : (
                        <Check size={16} />
                      )}
                      <span>{chapter.detail}</span>
                    </div>
                  )}
                </div>
              ))}
              {error && !authOpen && (
                <div className="st-entry-error" role="alert">
                  {error}
                </div>
              )}
            </div>
            <div className="st-caption">
              <i />
              THE BRANDORA STUDIO
              <span />
              One campaign. A little more considered.
            </div>
            <div className="st-story-bottom">
              <div className="st-scroll-cue">
                <i />
                SCROLL TO EXPLORE
              </div>
              <div className="st-chapter-nav" aria-label="Campaign chapters">
                {chapters.map((chapter, i) => (
                  <button
                    key={chapter.name}
                    onClick={() => goTo(i)}
                    aria-label={chapter.name}
                    aria-current={active === i ? "step" : undefined}
                  >
                    <span>0{i + 1}</span>
                    <span className="st-nav-label">{chapter.name}</span>
                  </button>
                ))}
              </div>
              <button
                className="st-motion"
                onClick={() => setPaused(!paused)}
                aria-pressed={paused || reduced}
                aria-label={paused ? "Enable animation" : "Reduce animation"}
              >
                {paused || reduced ? <Play size={14} /> : <Pause size={14} />}
                <span>
                  {paused || reduced ? "Motion reduced" : "Reduce motion"}
                </span>
              </button>
            </div>
            <div className="st-progress" aria-hidden="true">
              <div ref={bar} />
            </div>
          </div>
        </section>
        <section className="st-details" id="studio-details">
          <div className="st-details-intro">
            <span className="st-eyebrow">
              MADE FOR THE WORK BETWEEN DRAFT AND DONE
            </span>
            <h2>
              Good content takes a team.
              <br />
              <em>Give yours a shared workspace.</em>
            </h2>
            <p>
              Bring the work together, from an approved source to the person who
              signs it off.
            </p>
          </div>
          <div className="st-feature-rows">
            <article>
              <span>01</span>
              <h3>Keep the evidence close.</h3>
              <p>
                Approved sources, brand rules and claim links give every review
                the context it needs.
              </p>
              <Link2 size={22} />
            </article>
            <article>
              <span>02</span>
              <h3>Look at the whole message.</h3>
              <p>
                Review text, extracted visual content, logo comparisons and
                translations in one workflow.
              </p>
              <Check size={22} />
            </article>
            <article>
              <span>03</span>
              <h3>Know how you got here.</h3>
              <p>
                Follow version history and approval receipts back to the
                content, evidence and human decision.
              </p>
              <GitBranch size={22} />
            </article>
          </div>
          <p className="st-example-note">
            The studio above is an illustrative campaign. AI suggests; your team
            reviews and approves.
          </p>
        </section>
        <section className="st-cta">
          <div className="st-mini-robot" aria-hidden="true">
            <span />
            <span />
          </div>
          <span className="st-eyebrow">READY WHEN YOUR TEAM IS</span>
          <h2>
            Make room for
            <br />
            <em>a little more clarity.</em>
          </h2>
          <p>
            Start with a draft. Keep the evidence close.
            <br />
            Put your people in control.
          </p>
          <button className="st-button" onClick={explore} disabled={busy}>
            {cta}
            <ArrowUpRight size={18} />
          </button>
          <small>
            {demoAvailable
              ? "A separate demo workspace. Fictional data. Real workflows."
              : "Your next good decision starts here."}
          </small>
        </section>
      </main>
      <footer className="st-footer">
        <a className="st-logo" href="#" aria-label="Brandora home">
          {logo}
        </a>
        <span>A clear path from claim to confidence.</span>
        <button onClick={openWorkspace}>
          Your workspace <ArrowUpRight size={14} />
        </button>
        <small>BRANDORA © 2026</small>
      </footer>
      <dialog
        ref={dialog}
        className="st-auth"
        aria-labelledby="brandora-auth-title"
        onClose={() => setAuthOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setAuthOpen(false);
        }}
      >
        <div className="st-auth-inner">
          <button
            className="st-auth-close"
            onClick={() => setAuthOpen(false)}
            aria-label="Close sign in"
          >
            <X size={20} />
          </button>
          {children}
          <div className="st-auth-note">
            <LockKeyhole size={15} />
            <p>
              Rules-only by default. External AI is enabled by your workspace
              manager.
            </p>
          </div>
        </div>
      </dialog>
    </div>
  );
}
