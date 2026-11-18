"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { DemoTour } from "./components/demo-tour";
import { WorkspaceCrew } from "./components/workspace-crew";
import { LandingPage } from "./components/brand-crew-landing";
import { AIStatus } from "./components/intelligence";
import { ReviewWorkspace, type Stage } from "./components/review-workspace";
import {
  FixQueue,
  HomeDashboard,
  ImpactMonitor,
  LogoRegister,
  ScanDetect,
  VerifyQueue,
} from "./components/modules";
import {
  MODULES,
  api,
  type Data,
  type Modal,
  type Module,
  type Row,
  type View,
} from "./components/shared";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Search,
  Bell,
  LayoutDashboard,
  FileText,
  BookOpen,
  GitBranch,
  ShieldCheck,
  Layers,
  FlaskConical,
  History,
  Sparkles,
  Users,
  LockKeyhole,
  Check,
  CheckCheck,
  X,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  LogOut,
  CircleHelp,
  ExternalLink,
  AlertTriangle,
  Clock3,
  Upload,
  Download,
  ScanLine,
  Send,
  RotateCcw,
  CheckCircle2,
  Link2,
  CircleDot,
  Menu,
  Eye,
  Image as ImageIcon,
  Trash2,
  Pencil,
  CircleX,
  Loader2,
  Settings2,
  Wand2,
} from "lucide-react";

const ICONS: Record<View, any> = {
  Home: LayoutDashboard,
  "Company Hub": BookOpen,
  "Scan & Detect": ScanLine,
  "Verify & Review": ShieldCheck,
  "Fix & Approve": Wand2,
  "Impact Monitor": GitBranch,
  "Trust & Audit": History,
};
const descriptions: Record<View, string> = {
  Home: "What needs your attention, from live workspace records.",
  "Company Hub":
    "The official source of truth: pricing, approved claims, policies, evidence, brand assets and people.",
  "Scan & Detect":
    "Upload any marketing content. Brandora marks what contradicts, or is unsupported by, Company Hub.",
  "Verify & Review":
    "Reviewers confirm, reject or escalate each finding with the evidence side by side.",
  "Fix & Approve":
    "Turn findings into a corrected version, re-check it, and approve one exact version.",
  "Impact Monitor":
    "When an approved fact changes, find every piece of content that relied on it.",
  "Trust & Audit":
    "Who did what, when and why, plus approval receipts and privacy controls.",
};
const HUB_TABS = [
  "Sources & facts",
  "Brand assets",
  "Campaigns",
  "Team & roles",
  "Source conflicts",
  "Claim lineage",
] as const;
const TRUST_TABS = ["Audit trail", "Approval receipts", "Privacy & AI"] as const;
const ITEM_VIEWS: View[] = ["Scan & Detect", "Verify & Review", "Fix & Approve"];
function Badge({ value }: { value: string }) {
  const tone =
    /Contradiction|Gap|Unverified|changes|reassessment|conflict|withdrawn/i.test(
      value,
    )
      ? "amber"
      : /Approved|Ready|Verified|Closed|passes|Human resolved/i.test(value)
        ? "green"
        : /Confidence|review|Open/i.test(value)
          ? "blue"
          : "neutral";
  return (
    <span className={"badge " + tone}>
      <span />
      {value}
    </span>
  );
}
function Empty({
  icon: Icon = CheckCircle2,
  title,
  children,
}: {
  icon?: any;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Form({
  children,
  onSubmit,
  button = "Save",
  busy = false,
}: {
  children: React.ReactNode;
  onSubmit: (data: Record<string, string>) => void;
  button?: string;
  busy?: boolean;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          Object.fromEntries(new FormData(e.currentTarget)) as Record<
            string,
            string
          >,
        );
      }}
    >
      {children}
      <button className="button primary" disabled={busy} type="submit">
        {button}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={"logo " + (small ? "small" : "")}>
      <span className="crew-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="32" height="32">
          <rect x="1" y="1" width="32" height="32" rx="9" fill="currentColor" />
          <path
            d="m16 24 6 6 15-19"
            fill="none"
            stroke="#3a2bff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!small && (
        <span>
          Brandora<span className="logo-dot">.</span>
        </span>
      )}
    </div>
  );
}
const formatDate = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const shortHash = (s: string) => s?.slice(0, 12) || "—";

export default function App() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<View>("Home"),
    [stage, setStage] = useState<Stage>("review"),
    [hubTab, setHubTab] = useState<(typeof HUB_TABS)[number]>("Sources & facts"),
    [trustTab, setTrustTab] = useState<(typeof TRUST_TABS)[number]>("Audit trail"),
    [auditQuery, setAuditQuery] = useState(""),
    [lineageRule, setLineageRule] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [modal, setModal] = useState<Modal>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [mobile, setMobile] = useState(false),
    [narrow, setNarrow] = useState(false),
    [isDemo, setIsDemo] = useState(false),
    [exploreDemo, setExploreDemo] = useState(false),
    [production, setProduction] = useState(false),
    [setupRequired, setSetupRequired] = useState(false),
    [signup, setSignup] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width:760px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const notify = useCallback((s: string) => {
    setToast(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      setData(await api("/workspace"));
    } catch (e) {
      if ((e as Error).message.includes("sign in")) setData(null);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    api("/health")
      .then((v) => {
        setIsDemo(v.demo);
        setExploreDemo(v.explore_demo);
        setProduction(v.production);
        setSetupRequired(v.setup_required);
      })
      .catch(() =>
        setError(
          "The API is not reachable. Start the Brandora API, then reload.",
        ),
      );
  }, [refresh]);
  useEffect(() => {
    if (!modal) return;
    const prior = document.activeElement as HTMLElement;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button,.modal input,.modal select,.modal textarea,.modal a",
          ),
        ).filter((el) => !el.hasAttribute("disabled"));
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(
            ".modal input,.modal select,.modal textarea,.modal button",
          )
          ?.focus(),
      30,
    );
    return () => {
      document.removeEventListener("keydown", handle);
      prior?.focus();
    };
  }, [modal]);
  const action = async (
    path: string,
    method = "POST",
    body?: unknown,
    message = "Saved",
  ) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const value = await api(path, method, body);
      await refresh();
      notify(message);
      return value;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const go = (v: View, id: string | null = null, st: Stage = "review") => {
    setView(v);
    setSelected(id);
    setStage(st);
    setSearch("");
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const submitModal = async (
    path: string,
    method: string,
    body: unknown,
    message: string,
  ) => {
    const result = await action(path, method, body, message);
    if (result) setModal(null);
    return result;
  };
  const signIn = async (role?: string, values?: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      await api(
        role ? "/auth/demo/" + role : signup ? "/auth/register" : "/auth/login",
        "POST",
        values,
      );
      await refresh();
      go("Home");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const enterDemo = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/demo/start", "POST");
      setModal(null);
      setSignup(false);
      const fresh: Data = await api("/workspace");
      setData(fresh);
      const ad = fresh.content.find((c) =>
        fresh.creatives?.some((x) => x.content_id === c.id && x.origin === "fixture"),
      );
      go(ad ? "Scan & Detect" : "Home", ad?.id || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const changeDemoRole = async (role: string) => {
    const changed = await action(
      "/demo/role",
      "POST",
      { role },
      `Exploring as ${role}`,
    );
    if (changed) setModal(null);
    return changed;
  };
  const exitDemo = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/demo/exit", "POST");
      setData(null);
      setModal(null);
      go("Home");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (loading)
    return (
      <div className="boot">
        <Logo />
        <Loader2 className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!data)
    return (
      <LandingPage
        logo={<Logo />}
        onExplore={enterDemo}
        demoAvailable={exploreDemo}
        busy={busy}
        error={error}
      >
        <div className="login-form">
          <span className="kicker">YOUR BRAND WORKSPACE</span>
          <h2 id="brandora-auth-title">
            {signup ? "Make room for clarity." : "Welcome back."}
          </h2>
          <p>
            {signup
              ? "Create your workspace to start the review workflow."
              : "Good work starts with a shared source of truth."}
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Form
            onSubmit={(v) => signIn(undefined, v)}
            button={signup ? "Create workspace" : "Sign in"}
            busy={busy}
          >
            {signup && (
              <>
                <Field label="Your name">
                  <input name="name" required minLength={2} />
                </Field>
                <Field label="Workspace name">
                  <input name="workspace" required minLength={2} />
                </Field>
                {production && (
                  <Field label="One-time setup code">
                    <input
                      name="setup_token"
                      type="password"
                      required
                      autoComplete="off"
                    />
                  </Field>
                )}
              </>
            )}
            <Field label="Email address">
              <input
                name="email"
                type="email"
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                placeholder={
                  signup ? "At least 12 characters" : "Your password"
                }
                required
                minLength={signup ? 12 : 1}
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </Field>
          </Form>
          {(!production || setupRequired || signup) && (
            <button
              className="text-button login-switch"
              onClick={() => setSignup(!signup)}
            >
              {signup
                ? "Already have a workspace? Sign in"
                : "Create your workspace"}
            </button>
          )}
          {isDemo && (
            <div className="demo-login">
              <div className="divider">
                <span>EXPLORE THE FICTIONAL DEMO</span>
              </div>
              <div className="demo-roles">
                {["manager", "creator", "reviewer", "partner"].map((role) => (
                  <button
                    disabled={busy}
                    onClick={() => signIn(role)}
                    key={role}
                  >
                    <span>{role}</span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
              <small>
                Separate demo accounts let you try the complete review flow.
                Demo sign-in is disabled in production.
              </small>
            </div>
          )}
        </div>
      </LandingPage>
    );
  const manager = data.user.role === "manager",
    reviewer = ["manager", "reviewer"].includes(data.user.role),
    creator = ["manager", "creator", "partner"].includes(data.user.role);
  const active = data.content.find((c) => c.id === selected),
    awaitingDecision = data.content.filter((c) =>
      (c.findings || []).some((f: Row) => !f.resolved && !f.review),
    ),
    toCorrect = data.content.filter(
      (c) =>
        (c.findings || []).some((f: Row) => !f.resolved) &&
        c.status !== "In review",
    ),
    reassess = data.content.filter((c) => c.status === "Needs reassessment"),
    openTasks = data.tasks.filter((t) => t.status === "Open");
  const badges: Partial<Record<View, number>> = {
    "Verify & Review": awaitingDecision.length,
    "Fix & Approve": toCorrect.length + data.content.filter((c) => c.status === "In review").length,
    "Impact Monitor": reassess.length,
  };
  const openSettings = () => {
    setTrustTab("Privacy & AI");
    go("Trust & Audit");
  };
  const sourceForm = (source?: Row) =>
    setModal({
      title: source?.id
        ? "Publish a source revision"
        : "Register an approved source",
      body: (
        <Form
          button={source?.id ? "Publish revision" : "Register source"}
          onSubmit={(v) =>
            submitModal(
              "/sources" + (source?.id ? "/" + source.id : ""),
              source?.id ? "PUT" : "POST",
              v,
              "Source saved; dependent approvals rechecked.",
            )
          }
        >
          <p className="form-note">
            Enter approved material verbatim. Updating a source creates a new
            version and invalidates dependent approvals.
          </p>
          <Field label="Source title">
            <input
              name="title"
              defaultValue={source?.title}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Evidence owner">
            <input
              name="owner"
              defaultValue={source?.owner || data.user.name}
              required
            />
          </Field>
          <Field label="Approved excerpt">
            <textarea
              name="excerpt"
              rows={5}
              defaultValue={source?.excerpt}
              required
              minLength={8}
            />
          </Field>
          <div className="form-grid">
            <Field label="Review by">
              <input
                name="review_date"
                type="date"
                defaultValue={source?.review_date}
              />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={source?.status || "approved"}>
                <option value="approved">Approved</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </Field>
          </div>
        </Form>
      ),
    });
  const ruleForm = (rule?: Row) =>
    setModal({
      title: rule ? "Revise approved rule" : "Add a fact or rule",
      body: (
        <Form
          onSubmit={(v) => {
            try {
              const config = JSON.parse(v.config);
              return submitModal(
                "/rules" + (rule ? "/" + rule.id : ""),
                rule ? "PUT" : "POST",
                { ...v, config },
                "Rule saved and applicable content marked for reassessment.",
              );
            } catch {
              setError("Configuration must be valid JSON.");
            }
          }}
        >
          <div className="form-grid">
            <Field label="Rule ID">
              <input
                name="code"
                defaultValue={rule?.code}
                placeholder="F03"
                required
              />
            </Field>
            <Field label="Subject">
              <input
                name="subject"
                defaultValue={rule?.subject || data.rules[0]?.subject || data.workspace.name}
                required
              />
            </Field>
          </div>
          <Field label="Rule title">
            <input name="title" defaultValue={rule?.title} required />
          </Field>
          <Field label="Approved source">
            <select name="source_id" defaultValue={rule?.source_id} required>
              {data.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · v{s.version}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rule type">
            <select name="kind" defaultValue={rule?.kind || "term"}>
              {["term", "number", "required", "banned", "substantiation"].map(
                (k) => (
                  <option key={k}>{k}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Approved value / required text">
            <input name="value" defaultValue={rule?.value} required />
          </Field>
          <Field label="Matching configuration (JSON)">
            <textarea
              className="mono"
              name="config"
              rows={4}
              defaultValue={JSON.stringify(
                rule?.config || { variants: [] },
                null,
                2,
              )}
              required
            />
          </Field>
          <p className="form-note">
            Number: metric “price” or “trial”, optional plan, qualifier and
            qualifier_review. Term: variants. Substantiation: unsupported_terms
            and optional replacements (approved rewrites). Optional channels
            limits scope.
          </p>
        </Form>
      ),
    });
  const sourceName = (id: string) =>
    data.sources.find((s) => s.id === id)?.title || "Source";
  const receiptModal = (a: Row) =>
    setModal({
      title: "Approval receipt",
      body: (
        <div className="receipt">
          <div className="receipt-seal">
            <ShieldCheck size={32} />
            <span>EXACT-VERSION APPROVAL</span>
          </div>
          <h3>{a.snapshot.title}</h3>
          <Badge
            value={
              data.content.find((c) => c.id === a.content_id)?.version ===
              a.version
                ? data.content.find((c) => c.id === a.content_id)?.status ||
                  "Historical"
                : "Historical version"
            }
          />
          <dl>
            <dt>Reviewer</dt>
            <dd>{a.snapshot.reviewer}</dd>
            <dt>Approved</dt>
            <dd>{new Date(a.created).toLocaleString()}</dd>
            <dt>Content version</dt>
            <dd>v{a.version}</dd>
            <dt>Coverage</dt>
            <dd>{a.snapshot.coverage}</dd>
            <dt>SHA-256</dt>
            <dd className="mono hash">{a.content_hash}</dd>
          </dl>
          <blockquote>{a.snapshot.body}</blockquote>
          <h4>Evidence at approval</h4>
          {a.snapshot.dependencies.map((d: Row) => (
            <div className="receipt-dep" key={d.id}>
              <BookOpen size={15} />
              {d.source_title} · v{d.source_version}
              <span>{d.rule_value}</span>
            </div>
          ))}
          <p className="form-note">
            This receipt preserves the historical decision. Current validity can
            change when content or applicable evidence changes.
          </p>
          <button
            className="button"
            onClick={() => download("brandora-receipt-" + a.id + ".json", a)}
          >
            <Download size={15} />
            Download receipt
          </button>
        </div>
      ),
    });
  const sourceUse = (ruleId: string) =>
    data.dependencies.filter((d) => d.rule_id === ruleId).length;
  const itemOpen = !!active && ITEM_VIEWS.includes(view);
  const auditRows = data.activity.filter((a) =>
    `${a.action} ${a.target} ${a.actor}`
      .toLowerCase()
      .includes(auditQuery.toLowerCase()),
  );
  return (
    <div className="app-shell" data-view={view}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {mobile && narrow && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        inert={narrow && !mobile}
        className={"sidebar " + (mobile ? "open" : "")}
      >
        <button className="logo-home" onClick={() => go("Home")} aria-label="Home">
          <Logo />
        </button>
        <button className="workspace-switch" onClick={() => go("Company Hub")}>
          <span className="workspace-icon">
            {data.workspace.name.charAt(0).toUpperCase()}
          </span>
          <span>
            {data.workspace.name}
            <small>
              {data.judge_demo ? "Fictional demo company" : "Brand workspace"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label="Main navigation">
          <div className="nav-group">
            <button
              className={"nav-item " + (view === "Home" ? "active" : "")}
              onClick={() => go("Home")}
              aria-current={view === "Home" ? "page" : undefined}
            >
              <LayoutDashboard size={18} />
              <span>Home</span>
            </button>
          </div>
          <div className="nav-group">
            <span className="nav-label">SIX MODULES</span>
            {MODULES.map((name, i) => {
              const Icon = ICONS[name];
              return (
                <button
                  key={name}
                  className={"nav-item module " + (view === name ? "active" : "")}
                  onClick={() => go(name)}
                  aria-current={view === name ? "page" : undefined}
                >
                  <span className="nav-num">0{i + 1}</span>
                  <Icon size={17} />
                  <span>{name}</span>
                  {!!badges[name] && <b>{badges[name]}</b>}
                </button>
              );
            })}
          </div>
          <p className="nav-flow">
            Hub → Scan → Verify → Fix → Monitor → Audit
          </p>
        </nav>
        <div className="sidebar-bottom">
          <button className="mode-note" onClick={openSettings}>
            <span className="live-dot" />
            {data.workspace.settings.ai_enabled
              ? "AI assistance enabled"
              : "Rules-only workspace"}
            <LockKeyhole size={13} />
          </button>
          <button
            className="user-card"
            onClick={() =>
              setModal({
                title: "Your account",
                body: (
                  <div className="form">
                    <p>
                      Signed in as <b>{data.user.name}</b> · {data.user.role}.
                    </p>
                    <p className="muted">{data.user.email}</p>
                    <button
                      className="button"
                      onClick={async () => {
                        await api("/auth/logout", "POST");
                        setData(null);
                        setModal(null);
                      }}
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                ),
              })
            }
          >
            <span className="avatar">
              {data.user.name
                .split(" ")
                .map((x: string) => x[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span>
              {data.user.name}
              <small>{data.user.role}</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-controls="workspace-navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>{data.workspace.name}</span>
            <ChevronRight size={14} />
            <b>{view}</b>
            {itemOpen && (
              <>
                <ChevronRight size={14} />
                <span className="crumb-item">{active.title}</span>
              </>
            )}
          </div>
          <div className="top-actions">
            <div className="search-wrap">
              <Search size={16} />
              <input
                aria-label="Search content and sources"
                placeholder="Find content or a source…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <div className="search-results">
                  {[
                    ...data.content.map((c) => ({ ...c, type: "content" })),
                    ...data.sources.map((s) => ({ ...s, type: "source" })),
                  ]
                    .filter((r) =>
                      r.title.toLowerCase().includes(search.toLowerCase()),
                    )
                    .slice(0, 8)
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={() =>
                          r.type === "content"
                            ? go("Scan & Detect", r.id)
                            : (go("Company Hub"), setSearch(""))
                        }
                      >
                        {r.type === "content" ? (
                          <FileText size={15} />
                        ) : (
                          <BookOpen size={15} />
                        )}
                        <span>
                          {r.title}
                          <small>{r.type}</small>
                        </span>
                      </button>
                    ))}
                  {![...data.content, ...data.sources].some((r) =>
                    r.title.toLowerCase().includes(search.toLowerCase()),
                  ) && <p>No matching records.</p>}
                </div>
              )}
            </div>
            <button
              className="icon-button notification-button"
              aria-label={`${openTasks.length} open evidence tasks`}
              onClick={() => go("Verify & Review")}
            >
              <Bell size={19} />
              {openTasks.length > 0 && <i />}
            </button>
            <span className="top-avatar">{data.user.name[0]}</span>
          </div>
        </header>
        <main id="main" key={`${data.workspace.id}:${data.user.id}`}>
          {data.judge_demo ? (
            <DemoTour
              role={data.user.role}
              expires={data.judge_demo.expires}
              aiLimit={data.judge_demo.ai_limit}
              busy={busy}
              aiEnabled={data.workspace.settings.ai_enabled}
              collapsed={itemOpen || view !== "Home"}
              onRole={changeDemoRole}
              onExit={exitDemo}
              onReset={() =>
                setModal({
                  title: "Reset your demo?",
                  body: (
                    <div className="form">
                      <p>
                        This removes only your temporary demo and starts fresh
                        sample data. Your real workspace and other visitors are
                        unaffected.
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={async () => {
                          const reset = await action(
                            "/demo/reset",
                            "POST",
                            undefined,
                            "Demo reset",
                          );
                          if (reset) await enterDemo();
                        }}
                      >
                        Reset my demo
                      </button>
                    </div>
                  ),
                })
              }
              onStep={async (step) => {
                const ad = data.content.find((c) =>
                  data.creatives?.some(
                    (x) => x.content_id === c.id && x.origin === "fixture",
                  ),
                );
                const role =
                  step === "review" ? "reviewer" : step === "impact" || step === "ai" ? "manager" : "creator";
                if (data.user.role !== role && !(await changeDemoRole(role))) return;
                if (step === "inspect") go("Scan & Detect", ad?.id || null, "review");
                if (step === "review") go("Verify & Review", ad?.id || null, "review");
                if (step === "fix") go("Fix & Approve", ad?.id || null, "fix");
                if (step === "impact") go("Impact Monitor");
                if (step === "ai") openSettings();
              }}
            />
          ) : (
            exploreDemo && (
              <button
                className="text-button explore-workspace"
                disabled={busy}
                onClick={enterDemo}
              >
                <FlaskConical size={15} />
                Explore a separate demo
              </button>
            )
          )}
          {!itemOpen && (
            <div className="page-heading">
              <div>
                <div className="heading-kicker">
                  {view === "Home"
                    ? "THE BRAND CREW / YOUR WORKSPACE"
                    : `MODULE ${String(MODULES.indexOf(view as Module) + 1).padStart(2, "0")} / 06`}
                  {data.demo && <span>DEMO DATA</span>}
                </div>
                <h1>
                  {view === "Home"
                    ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${data.user.name.split(" ")[0]}.`
                    : view}
                </h1>
                <p>{descriptions[view]}</p>
              </div>
              {creator && view !== "Scan & Detect" && (
                <button className="button primary" onClick={() => go("Scan & Detect")}>
                  <ScanLine size={17} />
                  Scan content
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {itemOpen && (
            <ReviewWorkspace
              key={active.id}
              item={active}
              data={data}
              busy={busy}
              action={action}
              back={() => setSelected(null)}
              backLabel={"Back to " + view}
              receipt={receiptModal}
              notify={notify}
              setModal={setModal}
              initialStage={stage}
              onSettings={openSettings}
            />
          )}
          {view === "Home" && (
            <HomeDashboard
              data={data}
              go={go}
              crew={<WorkspaceCrew onNavigate={(v) => go(v)} />}
            />
          )}
          {view === "Scan & Detect" && !itemOpen && (
            <ScanDetect
              data={data}
              open={(id) => go("Scan & Detect", id)}
              refresh={refresh}
              onSettings={openSettings}
            />
          )}
          {view === "Verify & Review" && !itemOpen && (
            <VerifyQueue data={data} go={go} action={action} />
          )}
          {view === "Fix & Approve" && !itemOpen && (
            <FixQueue data={data} go={go} receipt={receiptModal} />
          )}
          {view === "Impact Monitor" && (
            <ImpactMonitor
              data={data}
              go={go}
              action={action}
              receipt={receiptModal}
              notify={notify}
            />
          )}
          {view === "Company Hub" && (
            <>
              <div className="module-tabs" role="tablist">
                {HUB_TABS.map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={hubTab === t}
                    className={hubTab === t ? "active" : ""}
                    onClick={() => setHubTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {hubTab === "Sources & facts" && (
                <>
                  <div className="section-toolbar">
                    <div className="tab-label">
                      <BookOpen size={17} />
                      Approved sources<span>{data.sources.length}</span>
                    </div>
                    {manager && (
                      <div className="editor-actions" style={{ marginTop: 0 }}>
                        <button
                          className="button"
                          onClick={() =>
                            setModal({
                              title: "Import an official document",
                              body: (
                                <DocumentImport
                                  onExtract={(r) =>
                                    sourceForm({
                                      ...r,
                                      id: "",
                                      code: "",
                                      owner: data.user.name,
                                      status: "approved",
                                      review_date: "",
                                    })
                                  }
                                />
                              ),
                            })
                          }
                        >
                          <Upload size={16} />
                          Import document
                        </button>
                        <button className="button" onClick={() => sourceForm()}>
                          <Plus size={16} />
                          Register source
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="source-grid">
                    {data.sources.map((s) => (
                      <article className="source-card" key={s.id}>
                        <div className="source-top">
                          <span className="source-icon">
                            <BookOpen size={23} />
                          </span>
                          <Badge
                            value={
                              s.current
                                ? "Approved"
                                : s.status === "withdrawn"
                                  ? "Withdrawn"
                                  : "Review overdue"
                            }
                          />
                        </div>
                        <h3>{s.title}</h3>
                        <p>{s.excerpt}</p>
                        <div className="source-meta">
                          <span>Version {s.version}</span>
                          <span>{s.owner}</span>
                        </div>
                        <footer>
                          <span>
                            <Clock3 size={13} />
                            {s.review_date
                              ? "Review by " + formatDate(s.review_date)
                              : "No review date set"}
                          </span>
                          {manager && (
                            <button
                              aria-label={"Edit " + s.title}
                              onClick={() => sourceForm(s)}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                        </footer>
                      </article>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-header">
                      <div>
                        <h2>Facts & rules</h2>
                        <p>
                          The exact values checks compare against, each tied to
                          an approved source and owner.
                        </p>
                      </div>
                      {manager && (
                        <button
                          className="button"
                          onClick={() => ruleForm()}
                          disabled={!data.sources.length}
                        >
                          <Plus size={16} />
                          Add rule
                        </button>
                      )}
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>RULE</th>
                            <th>APPROVED VALUE</th>
                            <th>SOURCE</th>
                            <th>USED IN</th>
                            <th>TYPE</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {data.rules.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <span className="rule-code">{r.code}</span>
                                <b>{r.title}</b>
                                <small className="block muted">
                                  {r.subject}
                                  {r.config?.plan ? ` · ${r.config.plan} plan` : ""}
                                </small>
                              </td>
                              <td>{r.value}</td>
                              <td>{sourceName(r.source_id)}</td>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setLineageRule(r.id);
                                    setHubTab("Claim lineage");
                                  }}
                                >
                                  {sourceUse(r.id)} item{sourceUse(r.id) === 1 ? "" : "s"}
                                </button>
                              </td>
                              <td>
                                <span className="channel">{r.kind}</span>
                              </td>
                              <td>
                                {manager && (
                                  <button
                                    className="icon-button"
                                    aria-label={"Edit " + r.code}
                                    onClick={() => ruleForm(r)}
                                  >
                                    <Pencil size={15} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {hubTab === "Brand assets" && (
                <>
                  <LogoRegister manager={manager} />
                  <VisualChecks />
                </>
              )}
              {hubTab === "Campaigns" && (
                <CampaignView
                  data={data}
                  go={(v, id) => go(v, id || null)}
                  manager={manager}
                  setModal={setModal}
                  submit={submitModal}
                />
              )}
              {hubTab === "Team & roles" && (
                <>
                  <section className="panel">
                    <div className="panel-header">
                      <div>
                        <h2>People & permissions</h2>
                        <p>
                          Roles are enforced by the API: creators draft,
                          reviewers decide and approve, managers own Company
                          Hub, partners see only assigned campaigns.
                        </p>
                      </div>
                      {manager && (
                        <button
                          className="button"
                          onClick={() =>
                            setModal({
                              title: "Add a team member",
                              body: (
                                <Form
                                  button="Create account"
                                  onSubmit={(v) =>
                                    submitModal(
                                      "/members",
                                      "POST",
                                      v,
                                      "Account created. Share its password privately.",
                                    )
                                  }
                                >
                                  <Field label="Full name">
                                    <input name="name" required />
                                  </Field>
                                  <Field label="Email">
                                    <input name="email" type="email" required />
                                  </Field>
                                  <Field label="Role">
                                    <select name="role">
                                      {["creator", "reviewer", "partner", "manager"].map((r) => (
                                        <option key={r}>{r}</option>
                                      ))}
                                    </select>
                                  </Field>
                                  <Field label="Initial password">
                                    <input
                                      type="password"
                                      name="password"
                                      minLength={12}
                                      required
                                      autoComplete="new-password"
                                    />
                                  </Field>
                                  <p className="form-note">
                                    {data.judge_demo
                                      ? "Demo members get fictional internal email addresses and cannot sign in outside this sandbox."
                                      : "This creates the account directly. No invitation email is sent."}
                                  </p>
                                </Form>
                              ),
                            })
                          }
                        >
                          <Plus size={16} />
                          Add member
                        </button>
                      )}
                    </div>
                    <div className="member-grid">
                      {data.members.map((m) => (
                        <article className="member-card" key={m.id}>
                          <span className="avatar large">
                            {m.name
                              .split(" ")
                              .map((s: string) => s[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                          <h3>{m.name}</h3>
                          <p>{m.email || "Workspace member"}</p>
                          <span className="role-tag">{m.role}</span>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-header">
                      <div>
                        <h2>Campaign access</h2>
                        <p>
                          Assignments are enforced on every content request.
                          Each organisation's data is isolated server-side.
                        </p>
                      </div>
                    </div>
                    <div className="task-list">
                      {data.campaigns.map((c) => (
                        <div className="task-row" key={c.id}>
                          <Layers size={24} />
                          <div>
                            <h3>{c.name}</h3>
                            <p>
                              {c.members
                                .map(
                                  (id: string) =>
                                    data.members.find((m) => m.id === id)?.name,
                                )
                                .filter(Boolean)
                                .join(", ") || "No partner assignments"}
                            </p>
                          </div>
                          {manager && (
                            <button
                              className="button small"
                              onClick={() =>
                                setModal({
                                  title: "Assign " + c.name,
                                  body: (
                                    <Form
                                      button="Grant access"
                                      onSubmit={(v) =>
                                        submitModal(
                                          "/campaigns/" + c.id + "/assign",
                                          "POST",
                                          v,
                                          "Campaign access granted",
                                        )
                                      }
                                    >
                                      <Field label="Member">
                                        <select name="user_id">
                                          {data.members
                                            .filter((m) => m.role === "partner")
                                            .map((m) => (
                                              <option key={m.id} value={m.id}>
                                                {m.name}
                                              </option>
                                            ))}
                                        </select>
                                      </Field>
                                    </Form>
                                  ),
                                })
                              }
                            >
                              Assign partner
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {hubTab === "Source conflicts" && (
                <ConflictView reloadKey={data.workspace.revision} />
              )}
              {hubTab === "Claim lineage" && (
                <Lineage
                  data={data}
                  initialRule={lineageRule && data.rules.some((r) => r.id === lineageRule) ? lineageRule : undefined}
                  onOpen={(id) => go("Scan & Detect", id)}
                />
              )}
            </>
          )}
          {view === "Trust & Audit" && (
            <>
              <div className="module-tabs" role="tablist">
                {TRUST_TABS.map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={trustTab === t}
                    className={trustTab === t ? "active" : ""}
                    onClick={() => setTrustTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {trustTab === "Audit trail" && (
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Workspace audit trail</h2>
                      <p>
                        Every upload, fact change, finding decision, approval
                        and setting change, newest first. Records cannot be
                        edited from the app.
                      </p>
                    </div>
                    <input
                      className="audit-search"
                      aria-label="Filter audit events"
                      placeholder="Filter by action, record or person"
                      value={auditQuery}
                      onChange={(e) => setAuditQuery(e.target.value)}
                    />
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>ACTION</th>
                          <th>RECORD</th>
                          <th>WHO</th>
                          <th>DETAIL</th>
                          <th>WHEN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditRows.map((a) => (
                          <tr
                            key={a.id}
                            onClick={() =>
                              a.detail?.content_id &&
                              data.content.some((c) => c.id === a.detail.content_id) &&
                              go("Verify & Review", a.detail.content_id, "history")
                            }
                          >
                            <td>{a.action}</td>
                            <td>{a.target}</td>
                            <td>{a.actor}</td>
                            <td className="muted">
                              {a.detail?.reason ||
                                (a.detail?.version ? `v${a.detail.version}` : "") ||
                                (a.detail?.findings !== undefined
                                  ? `${a.detail.findings} findings`
                                  : "")}
                            </td>
                            <td className="muted">{new Date(a.created).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {trustTab === "Approval receipts" && (
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Approval receipts</h2>
                      <p>
                        Each receipt preserves the content, reviewer, SHA-256
                        hash and evidence versions at the moment of approval.
                      </p>
                    </div>
                  </div>
                  {data.approvals.length ? (
                    <div className="receipt-list">
                      {data.approvals.map((a) => (
                        <button
                          className="receipt-row"
                          key={a.id}
                          onClick={() => receiptModal(a)}
                        >
                          <span className="receipt-icon">
                            <ShieldCheck size={23} />
                          </span>
                          <span>
                            <b>{a.snapshot.title}</b>
                            <small>
                              v{a.version} · {a.snapshot.reviewer} ·{" "}
                              {formatDate(a.created)}
                            </small>
                          </span>
                          <code>{shortHash(a.content_hash)}</code>
                          <ArrowUpRight size={18} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty icon={History} title="History begins with your first approval">
                      Approve a reviewed version to create a receipt.
                    </Empty>
                  )}
                </section>
              )}
              {trustTab === "Privacy & AI" && (
                <>
                  <section className="privacy-hero">
                    <LockKeyhole size={32} />
                    <div>
                      <h2>Human control. Visible boundaries.</h2>
                      <p>
                        Rule checks run on the Brandora server. External AI
                        (OCR, logo comparison, semantic suggestions,
                        translation) stays off unless a manager enables it.
                      </p>
                    </div>
                    <Badge
                      value={
                        data.workspace.settings.ai_enabled ? "AI enabled" : "Rules only"
                      }
                    />
                  </section>
                  <div className="settings-grid">
                    <section className="panel settings-panel">
                      <h2>AI & data handling</h2>
                      <div className="setting-row">
                        <div>
                          <b>AI review, OCR, logo comparison & translation</b>
                          <p>
                            {data.ai_configured
                              ? "Provider configured. AI output is never treated as proof and always needs human review."
                              : "No provider configured. Deterministic checks are available."}
                          </p>
                        </div>
                        <button
                          className={
                            "toggle " + (data.workspace.settings.ai_enabled ? "on" : "")
                          }
                          aria-label="Enable AI services"
                          role="switch"
                          aria-checked={!!data.workspace.settings.ai_enabled}
                          disabled={!manager || busy}
                          onClick={() =>
                            action(
                              "/settings",
                              "PUT",
                              { ai_enabled: !data.workspace.settings.ai_enabled },
                              "AI policy updated",
                            )
                          }
                        >
                          <span />
                        </button>
                      </div>
                      {!manager && (
                        <p className="form-note">
                          Only managers change this{data.judge_demo ? " — switch to Manager in the demo bar" : ""}.
                        </p>
                      )}
                      <ul className="privacy-list">
                        <li>
                          <Check size={16} />
                          No automatic publishing or approval.
                        </li>
                        <li>
                          <Check size={16} />
                          Email and phone masking before AI text review.
                        </li>
                        <li>
                          <Check size={16} />
                          Uploaded creatives are stored privately with their
                          version for review and audit; deleting content removes
                          them.
                        </li>
                        <li>
                          <Check size={16} />
                          Turning AI on or off sends affected content back for
                          re-checking.
                        </li>
                      </ul>
                    </section>
                    <AIStatus />
                    <section className="panel settings-panel">
                      <h2>Workspace data</h2>
                      <dl>
                        <dt>Workspace</dt>
                        <dd>{data.workspace.name}</dd>
                        <dt>Your role</dt>
                        <dd className="capitalize">{data.user.role}</dd>
                        <dt>Authentication</dt>
                        <dd>Server sessions · HTTP-only cookies</dd>
                        <dt>Isolation</dt>
                        <dd>Every query is scoped to this organisation</dd>
                        <dt>AI provider</dt>
                        <dd>
                          {data.ai_configured ? `${data.ai_provider} configured` : "Not configured"}
                        </dd>
                      </dl>
                      {manager && (
                        <button
                          className="button"
                          onClick={async () => {
                            const r = await api("/export");
                            download("brandora-workspace.json", r);
                          }}
                        >
                          <Download size={16} />
                          Export workspace
                        </button>
                      )}
                      <p className="form-note">
                        Deleting content removes stored text, images and review
                        notes while keeping receipt hashes and audit metadata.
                      </p>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>
              <span className="live-dot" />
              Evidence-connected workspace
            </span>
            <span>
              Made for careful decisions. <b>Brandora.</b>
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <header>
              <h2 id="modal-title">{modal.title}</h2>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                <X size={20} />
              </button>
            </header>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {modal.body}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {busy && (
        <div className="working" role="status">
          <Loader2 size={15} className="spin" />
          Working…
        </div>
      )}
    </div>
  );
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Lineage({
  data,
  onOpen,
  initialRule,
}: {
  data: Data;
  onOpen: (id: string) => void;
  initialRule?: string;
}) {
  const [ruleId, setRuleId] = useState(initialRule || data.rules[0]?.id || "");
  const rule = data.rules.find((r) => r.id === ruleId),
    source = data.sources.find((s) => s.id === rule?.source_id),
    deps = data.dependencies.filter((d) => d.rule_id === ruleId),
    items = data.content.filter((c) => deps.some((d) => d.content_id === c.id));
  return (
    <section className="panel lineage">
      <div className="panel-header">
        <div>
          <h2>A claim’s connected story</h2>
          <p>Select a rule to trace its currently scanned dependents.</p>
        </div>
        <select
          aria-label="Rule to trace"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
        >
          {data.rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} · {r.title}
            </option>
          ))}
        </select>
      </div>
      {rule && source ? (
        <>
          <div className="lineage-root">
            <div className="lineage-card">
              <span className="kicker">APPROVED SOURCE</span>
              <BookOpen size={24} />
              <h3>{source.title}</h3>
              <p>
                Version {source.version} · {source.owner}
              </p>
              <Badge value={source.current ? "Approved" : "Review overdue"} />
            </div>
            <div className="lineage-edge">
              <span>supports</span>
              <ArrowRight />
            </div>
            <div className="lineage-card claim">
              <span className="kicker">FACT / RULE {rule.code}</span>
              <GitBranch size={24} />
              <h3>{rule.value}</h3>
              <p>
                {rule.title} · {rule.subject}
              </p>
              <span className="channel">
                {items.length} dependent content items
              </span>
            </div>
          </div>
          <div className="lineage-children">
            {items.map((c) => (
              <button
                key={c.id}
                className="lineage-child"
                onClick={() => onOpen(c.id)}
              >
                <FileText size={21} />
                <b>{c.title}</b>
                <span>
                  {c.channel} · v{c.version}
                </span>
                <Badge value={c.status} />
                <ArrowUpRight className="lineage-open" size={16} />
              </button>
            ))}
          </div>
          {!items.length && (
            <Empty title="No recorded dependents">
              Scan content that uses this rule to establish its evidence links.
            </Empty>
          )}
          <p className="lineage-caption">
            <Link2 size={14} />
            Dependencies are recorded by the server during scans. Source changes
            trigger targeted reassessment.
          </p>
        </>
      ) : (
        <Empty title="Start with an approved rule">
          Add a source and a fact in the rulebook.
        </Empty>
      )}
    </section>
  );
}
function ConflictView({ reloadKey }: { reloadKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/conflicts")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [reloadKey]);
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Approved-source comparison</h2>
          <p>Matches numeric facts by subject, metric and conditions.</p>
        </div>
      </div>
      {error ? (
        <div className="error">{error}</div>
      ) : rows === null ? (
        <Empty icon={Loader2} title="Checking approved sources…" />
      ) : !rows.length ? (
        <Empty icon={CheckCheck} title="Your structured facts agree">
          No conflicting approved values were found within the checked scope.
          This is not an exhaustive semantic review.
        </Empty>
      ) : (
        rows.map((r, i) => (
          <div className="conflict" key={i}>
            <Badge value="Source conflict" />
            <h3>
              {r.subject} · {r.metric}
            </h3>
            <div className="conflict-values">
              {r.rules.map((x: Row) => (
                <div key={x.id}>
                  <strong>{x.value}</strong>
                  <span>{x.source}</span>
                  <small>
                    {x.code} · {r.condition || "Same conditions"}
                  </small>
                </div>
              ))}
            </div>
            <p>
              Ask the source owner to withdraw or correct the outdated value.
              Content stays uncertain until the conflict is resolved.
            </p>
          </div>
        ))
      )}
    </section>
  );
}
function VisualChecks() {
  const [result, setResult] = useState<any>(null),
    [palette, setPalette] = useState<any>(null),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <span className="feature-icon">
          <ImageIcon size={25} />
        </span>
        <h2>A closer look at your creative</h2>
        <p className="muted">
          Upload a PNG or JPG to inspect its actual palette. Up to 3 MB and 4
          megapixels.
        </p>
        <label className="upload-zone">
          <Upload size={29} />
          <b>{uploading ? "Inspecting image…" : "Choose an image"}</b>
          <span>Processed by your API server · not retained</span>
          <input
            aria-label="Image to inspect"
            type="file"
            accept="image/png,image/jpeg"
            disabled={uploading}
            onChange={async (e) => {
              if (!e.target.files?.[0]) return;
              setUploading(true);
              setError("");
              const f = new FormData();
              f.append("file", e.target.files[0]);
              try {
                setPalette(await api("/visual/image", "POST", f));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {palette && (
          <>
            <div className="palette">
              {palette.palette.map((c: string) => (
                <div key={c}>
                  <span style={{ background: c }} />
                  <code>{c}</code>
                </div>
              ))}
            </div>
            <p>
              {palette.width} × {palette.height} px ·{" "}
              {Math.round(palette.bytes / 1024)} KB
            </p>
            <p className="form-note">{palette.coverage}</p>
          </>
        )}
        {error && <div className="error">{error}</div>}
      </section>
      <section className="panel settings-panel">
        <h2>Colour contrast</h2>
        <p className="muted">
          Test the text and background colours you choose.
        </p>
        <Form
          button="Check contrast"
          onSubmit={async (v) => {
            try {
              setResult(
                await api("/visual/contrast", "POST", {
                  ...v,
                  large_text: v.large_text === "true",
                }),
              );
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <div className="form-grid">
            <Field label="Text colour">
              <input name="foreground" type="color" defaultValue="#172659" />
            </Field>
            <Field label="Background colour">
              <input name="background" type="color" defaultValue="#ffffff" />
            </Field>
          </div>
          <Field label="Text size">
            <select name="large_text">
              <option value="false">Normal text · requires 4.5:1</option>
              <option value="true">Large text · requires 3:1</option>
            </select>
          </Field>
          <Field label="Image description / alt text">
            <input
              name="alt_text"
              placeholder="Describe what matters in the image"
            />
          </Field>
        </Form>
        {result && (
          <div
            className={"contrast-result " + (result.passes ? "pass" : "fail")}
          >
            <strong>{result.ratio}:1</strong>
            <Badge
              value={
                result.passes ? "Contrast passes" : "Contrast needs changes"
              }
            />
            <p>
              Required: {result.threshold}:1 · Alt text{" "}
              {result.alt_present ? "provided" : "missing"}
            </p>
            <small>{result.coverage}</small>
          </div>
        )}
      </section>
    </div>
  );
}
function CampaignView({
  data,
  go,
  manager,
  setModal,
  submit,
}: {
  data: Data;
  go: (v: View, id?: string) => void;
  manager: boolean;
  setModal: (m: Modal) => void;
  submit: any;
}) {
  const [comparison, setComparison] = useState<any>(null),
    [error, setError] = useState("");
  return (
    <>
      <div className="section-toolbar">
        <span className="muted">
          {data.campaigns.length} campaigns in your workspace
        </span>
        {manager && (
          <button
            className="button"
            onClick={() =>
              setModal({
                title: "Create a campaign",
                body: (
                  <Form
                    onSubmit={(v) =>
                      submit("/campaigns", "POST", v, "Campaign created")
                    }
                  >
                    <Field label="Campaign name">
                      <input name="name" required />
                    </Field>
                    <Field label="What is this campaign for?">
                      <textarea name="description" rows={3} />
                    </Field>
                  </Form>
                ),
              })
            }
          >
            <Plus size={16} />
            New campaign
          </button>
        )}
      </div>
      <div className="campaign-grid">
        {data.campaigns.map((c) => (
          <article className="panel campaign-card" key={c.id}>
            <div className="campaign-art">
              <Layers size={35} />
              <span>CAMPAIGN / {c.name.slice(0, 2).toUpperCase()}</span>
              <div />
            </div>
            <h2>{c.name}</h2>
            <p>{c.description || "A shared context for your content."}</p>
            <div className="campaign-counts">
              <span>
                {data.content.filter((x) => x.campaign_id === c.id).length}{" "}
                content items
              </span>
              <span>
                {
                  data.content.filter(
                    (x) => x.campaign_id === c.id && x.status === "Approved",
                  ).length
                }{" "}
                approved
              </span>
            </div>
            <button
              className="button"
              onClick={async () => {
                try {
                  setComparison(
                    await api("/campaigns/" + c.id + "/compare", "POST"),
                  );
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Compare channel content
              <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {comparison && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Campaign comparison</h2>
              <p>
                Every channel is checked against the same approved facts. This
                preview does not change content.
              </p>
            </div>
          </div>
          {comparison.length ? (
            comparison.map((c: Row) => (
              <div className="task-row" key={c.id}>
                <span className="channel">{c.channel}</span>
                <div>
                  <h3>{c.title}</h3>
                  <p>
                    {c.findings.length
                      ? c.findings.map((f: Row) => f.title).join(" · ")
                      : "No issues in checked rules"}
                  </p>
                </div>
                <Badge
                  value={
                    c.findings.length
                      ? `${c.findings.length} changes`
                      : "Checked"
                  }
                />
                <button
                  className="icon-button"
                  aria-label={"Open " + c.title}
                  onClick={() => go("Scan & Detect", c.id)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </div>
            ))
          ) : (
            <Empty title="This campaign has no content yet" />
          )}
        </section>
      )}
    </>
  );
}
function DocumentImport({ onExtract }: { onExtract: (record: Row) => void }) {
  const [busy, setBusy] = useState(false),
    [ocr, setOcr] = useState(false),
    [extracted, setExtracted] = useState<Row | null>(null),
    [error, setError] = useState("");
  return (
    <div>
      <p className="form-note">
        Extract text from a PDF, DOCX, TXT or Markdown file, then review it
        before approval. Maximum 3 MB, 20 PDF pages and 12,000 extracted
        characters. AI OCR supports images and scanned PDFs of up to ten pages.
      </p>
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={ocr}
          disabled={busy}
          onChange={(e) => setOcr(e.target.checked)}
        />
        Use AI OCR (sends this document to the configured provider)
      </label>
      <label className="upload-zone">
        <Upload size={28} />
        <b>{busy ? "Reading document…" : "Choose a document"}</b>
        <span>
          {ocr
            ? "AI transcription must be checked before source approval."
            : "Text extraction runs on your API server. Original files are not retained."}
        </span>
        <input
          type="file"
          accept={ocr ? ".pdf,.png,.jpg,.jpeg,.webp" : ".pdf,.docx,.txt,.md"}
          aria-label="Document to extract"
          disabled={busy}
          onChange={async (e) => {
            if (!e.target.files?.[0]) return;
            setBusy(true);
            setError("");
            const body = new FormData();
            body.append("file", e.target.files[0]);
            try {
              setExtracted(
                await api(
                  ocr ? "/sources/ocr" : "/sources/extract",
                  "POST",
                  body,
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {extracted && (
        <div>
          <p className="form-note">{extracted.message}</p>
          {(extracted.warnings || []).map((w: string, i: number) => (
            <p className="form-note" key={i}>
              {w}
            </p>
          ))}
          <label className="field">
            Review extracted text
            <textarea
              rows={7}
              value={extracted.excerpt}
              onChange={(e) =>
                setExtracted({ ...extracted, excerpt: e.target.value })
              }
            />
          </label>
          <button
            className="button primary"
            onClick={() => onExtract(extracted)}
          >
            Continue to source registration
          </button>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
