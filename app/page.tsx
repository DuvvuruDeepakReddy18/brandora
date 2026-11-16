"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { DemoTour } from "./components/demo-tour";
import {
  AIStatus,
  VisualIntelligence,
  TranslationPanel,
} from "./components/intelligence";
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
} from "lucide-react";

type Row = { id: string; title: any; code: any; [key: string]: any };
type Data = {
  user: Row;
  workspace: Row;
  demo: boolean;
  judge_demo: { expires: string; ai_limit: number; roles: string[] } | null;
  ai_configured: boolean;
  ai_provider: string | null;
  members: Row[];
  campaigns: Row[];
  sources: Row[];
  rules: Row[];
  content: Row[];
  approvals: Row[];
  dependencies: Row[];
  tasks: Row[];
  decisions: Row[];
  activity: Row[];
};
type View =
  | "Overview"
  | "Content studio"
  | "Review desk"
  | "Rulebook & sources"
  | "Claim DNA"
  | "Source conflicts"
  | "Knowledge gaps"
  | "Visual checks"
  | "Campaigns"
  | "Impact lab"
  | "Time machine"
  | "Learning loop"
  | "Partner workspace"
  | "Privacy & settings";
type Modal = { title: string; body: React.ReactNode } | null;
const sections = [
  {
    label: "WORKSPACE",
    items: [
      ["Overview", LayoutDashboard],
      ["Content studio", FileText],
      ["Review desk", ShieldCheck],
      ["Rulebook & sources", BookOpen],
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      ["Claim DNA", GitBranch],
      ["Source conflicts", AlertTriangle],
      ["Knowledge gaps", CircleHelp],
      ["Visual checks", ScanLine],
      ["Campaigns", Layers],
      ["Impact lab", FlaskConical],
      ["Time machine", History],
      ["Learning loop", Sparkles],
    ],
  },
  {
    label: "ORGANISATION",
    items: [
      ["Partner workspace", Users],
      ["Privacy & settings", LockKeyhole],
    ],
  },
] as const;
const descriptions: Record<View, string> = {
  Overview: "A clear view of what your brand says, and what supports it.",
  "Content studio": "Shape your message. Keep the evidence close.",
  "Review desk":
    "Every approval is a human decision, tied to an exact version.",
  "Rulebook & sources": "The approved material behind every finding.",
  "Claim DNA": "Follow a claim from its source to every place it appears.",
  "Source conflicts": "Resolve disagreements in your approved knowledge.",
  "Knowledge gaps": "Give unsupported claims an owner and a next step.",
  "Visual checks":
    "Check the details that make a brand readable and recognisable.",
  Campaigns: "One reference. A consistent story across channels.",
  "Impact lab": "Understand a change before you put it into effect.",
  "Time machine": "The decision, the evidence and the version as they were.",
  "Learning loop": "Turn review decisions into clearer guidance.",
  "Partner workspace":
    "The same source of truth, with carefully scoped access.",
  "Privacy & settings":
    "Control your workspace and the services your content touches.",
};
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
function Badge({ value }: { value: string }) {
  const tone = /Approved|Ready|Verified|Closed|passes/i.test(value)
    ? "green"
    : /Gap|changes|reassessment|conflict|withdrawn/i.test(value)
      ? "amber"
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
      <span className="logo-mark">
        <i />
        <i />
        <i />
      </span>
      {!small && (
        <span>
          brandora<span className="logo-dot">.</span>
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
    [view, setView] = useState<View>("Overview"),
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
  const go = (v: View, id: string | null = null) => {
    setView(v);
    setSelected(id);
    setSearch("");
    setMobile(false);
    window.scrollTo({ top: 0 });
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
      setView("Overview");
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
      go("Overview");
      await refresh();
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
    if (changed) {
      setModal(null);
      go(role === "reviewer" ? "Review desk" : "Overview");
    }
    return changed;
  };
  const exitDemo = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/demo/exit", "POST");
      setData(null);
      setModal(null);
      go("Overview");
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
      <div className="login">
        <section className="login-story">
          <Logo />
          <div className="login-main">
            <span className="eyebrow">EVIDENCE BEFORE EVERYTHING</span>
            <h1>
              Your brand has a story.
              <br />
              <em>Give it a source.</em>
            </h1>
            <p>
              Bring your content, evidence and approvals together.
              <br />
              Know what you can stand behind.
            </p>
            <div className="story-chain">
              <div>
                <BookOpen />
                <span>Approved source</span>
                <small>Pricing sheet · v1</small>
              </div>
              <ArrowRight />
              <div>
                <FileText />
                <span>Supported claim</span>
                <small>Exact words. Clear evidence.</small>
              </div>
              <ArrowRight />
              <div>
                <ShieldCheck />
                <span>Human approval</span>
                <small>Signed to this version.</small>
              </div>
            </div>
          </div>
          <div className="login-foot">
            <span>A clearer path from claim to confidence.</span>
            <span>BRANDORA / 2026</span>
          </div>
        </section>
        <section className="login-panel">
          <div className="login-form">
            <span className="kicker">YOUR BRAND WORKSPACE</span>
            <h2>{signup ? "Make room for clarity." : "Welcome back."}</h2>
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
            {exploreDemo && (
              <div className="explore-entry">
                <span className="kicker">HERE TO EVALUATE?</span>
                <button
                  className="button primary"
                  onClick={enterDemo}
                  disabled={busy}
                >
                  <FlaskConical size={18} />
                  {busy ? "Opening demo…" : "Explore demo"}
                  <ArrowRight size={17} />
                </button>
                <p>
                  No account needed. Your own sample workspace with creator,
                  reviewer, manager and partner roles.
                </p>
                <div className="divider">
                  <span>OR SIGN IN TO YOUR WORKSPACE</span>
                </div>
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
          <div className="login-note">
            <LockKeyhole size={14} /> Rules-only by default. Your content stays
            in your workspace unless you enable an external AI service.
          </div>
        </section>
      </div>
    );
  const manager = data.user.role === "manager",
    reviewer = ["manager", "reviewer"].includes(data.user.role),
    creator = ["manager", "creator", "partner"].includes(data.user.role);
  const active = data.content.find((c) => c.id === selected),
    reviewQueue = data.content.filter((c) =>
      ["In review", "Needs reassessment"].includes(c.status),
    ),
    openTasks = data.tasks.filter((t) => t.status === "Open");
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
                defaultValue={rule?.subject || "HarborDesk"}
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
                rule?.config || { variants: ["Harbor Desk"] },
                null,
                2,
              )}
              required
            />
          </Field>
          <p className="form-note">
            Number: metric “price” or “trial”, optional qualifier. Term:
            variants. Substantiation: unsupported_terms explicitly verified
            against your register. Optional channels limits scope.
          </p>
        </Form>
      ),
    });
  const newContent = () => {
    if (!data.campaigns.length) {
      notify("Create a campaign first.");
      go("Campaigns");
      return;
    }
    setModal({
      title: "Start with your message",
      body: (
        <Form
          button="Create draft"
          onSubmit={async (v) => {
            const r = await submitModal("/content", "POST", v, "Draft created");
            if (r) go("Content studio", r.id);
          }}
        >
          <Field label="Content title">
            <input
              name="title"
              placeholder="A name your team will recognise"
              required
            />
          </Field>
          <div className="form-grid">
            <Field label="Campaign">
              <select name="campaign_id">
                {data.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Channel">
              <select name="channel">
                {["Social", "Email", "Website", "Advertisement"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Product / subject">
            <input name="subject" defaultValue={data.workspace.name} required />
          </Field>
          <Field label="Draft language">
            <select name="language" defaultValue="en">
              {Object.entries({
                en: "English",
                hi: "Hindi",
                te: "Telugu",
                ta: "Tamil",
                kn: "Kannada",
                ml: "Malayalam",
                bn: "Bengali",
                mr: "Marathi",
                gu: "Gujarati",
                es: "Spanish",
                fr: "French",
                de: "German",
                pt: "Portuguese",
                ar: "Arabic",
                ja: "Japanese",
                ko: "Korean",
                zh: "Chinese",
              }).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Your draft">
            <textarea
              name="body"
              rows={7}
              maxLength={5000}
              placeholder="Write or paste the content you want to check…"
              required
            />
          </Field>
          <p className="form-note">
            Up to 5,000 characters. Nothing is published automatically.
          </p>
        </Form>
      ),
    });
  };
  const sourceName = (id: string) =>
    data.sources.find((s) => s.id === id)?.title || "Source";
  const contentTable = (items: Row[]) =>
    items.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>CONTENT</th>
              <th>CHANNEL</th>
              <th>STATUS</th>
              <th>LAST UPDATED</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} onClick={() => go("Content studio", c.id)}>
                <td>
                  <button className="row-link">
                    <span className="file-icon">
                      <FileText size={18} />
                    </span>
                    <span>
                      {c.title}
                      <small>
                        {
                          data.campaigns.find((p) => p.id === c.campaign_id)
                            ?.name
                        }{" "}
                        · v{c.version}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className="channel">{c.channel}</span>
                </td>
                <td>
                  <Badge value={c.status} />
                </td>
                <td className="muted">{formatDate(c.updated)}</td>
                <td>
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty title="A clean slate">
        Your drafts will appear here as you create them.
      </Empty>
    );
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
  return (
    <div className="app-shell">
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
        <Logo />
        <button
          className="workspace-switch"
          onClick={() => go("Privacy & settings")}
        >
          <span className="workspace-icon">H</span>
          <span>
            {data.workspace.name}
            <small>
              {data.demo ? "Fictional demo workspace" : "Brand workspace"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label="Main navigation">
          {sections.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map(([name, Icon]) => (
                <button
                  key={name}
                  className={"nav-item " + (view === name ? "active" : "")}
                  onClick={() => go(name)}
                  aria-current={view === name ? "page" : undefined}
                >
                  <Icon size={18} />
                  <span>{name}</span>
                  {name === "Review desk" && reviewQueue.length > 0 && (
                    <b>{reviewQueue.length}</b>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-note">
            <span className="live-dot" />
            {data.workspace.settings.ai_enabled
              ? "AI assistance enabled"
              : "Rules-only workspace"}
            <LockKeyhole size={13} />
          </div>
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
                    {data.demo && !data.judge_demo && (
                      <p className="form-note">
                        To test independent approval, sign out and select the
                        reviewer account.
                      </p>
                    )}
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
                            ? go("Content studio", r.id)
                            : (go("Rulebook & sources"), setSearch(""))
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
              onClick={() => go("Knowledge gaps")}
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
              onStart={async () => {
                if (
                  data.user.role !== "creator" &&
                  !(await changeDemoRole("creator"))
                )
                  return;
                go(
                  "Content studio",
                  data.content.find((c) => c.title === "Launch announcement")
                    ?.id || null,
                );
              }}
              onAI={async () => {
                if (
                  data.user.role !== "manager" &&
                  !(await changeDemoRole("manager"))
                )
                  return;
                go("Privacy & settings");
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
          <div className="page-heading">
            <div>
              <div className="heading-kicker">
                {view === "Overview"
                  ? "YOUR BRAND, IN FOCUS"
                  : "BRANDORA WORKSPACE"}
                {data.demo && <span>DEMO DATA</span>}
              </div>
              <h1>
                {view === "Overview"
                  ? `Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${data.user.name.split(" ")[0]}.`
                  : view}
              </h1>
              <p>{descriptions[view]}</p>
            </div>
            {creator && (
              <button className="button primary" onClick={newContent}>
                <Plus size={17} />
                New content
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {view === "Overview" && (
            <>
              <section className="overview-hero">
                <div className="hero-copy">
                  <span className="eyebrow">CONNECTED BRAND GOVERNANCE</span>
                  <h2>
                    Every claim.
                    <br />
                    <em>A clear line to its source.</em>
                  </h2>
                  <p>
                    Review with context. Approve with confidence.
                    <br />
                    Stay in sync when the facts change.
                  </p>
                  <button
                    className="hero-link"
                    onClick={() => go("Review desk")}
                  >
                    Open review desk
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div
                  className="hero-map"
                  aria-label="Source linked to a claim and a human approval"
                >
                  <div className="map-top">
                    <div className="map-icon">
                      <BookOpen size={21} />
                    </div>
                    <div>
                      <small>APPROVED SOURCE</small>
                      <b>Pricing sheet</b>
                      <span>
                        {data.sources[0]
                          ? "Version " + data.sources[0].version
                          : "Your evidence starts here"}
                      </span>
                    </div>
                    <CheckCircle2 className="map-check" size={17} />
                  </div>
                  <div className="map-connector">
                    <span />
                    <span>evidence you can follow</span>
                  </div>
                  <div className="map-bottom">
                    <span>
                      <Link2 size={17} />
                      Claim
                    </span>
                    <ArrowRight size={18} />
                    <span>
                      <ShieldCheck size={17} />
                      Approval
                    </span>
                  </div>
                  <div className="map-caption">
                    <span className="live-dot" /> Connected across every version
                  </div>
                </div>
              </section>
              <section className="stats">
                {[
                  {
                    label: "Content in workspace",
                    value: data.content.length,
                    note: "Across " + data.campaigns.length + " campaigns",
                    icon: FileText,
                  },
                  {
                    label: "Ready for a decision",
                    value: reviewQueue.length,
                    note: "Human review keeps you in control",
                    icon: ShieldCheck,
                  },
                  {
                    label: "Approved sources",
                    value: data.sources.filter((s) => s.current).length,
                    note: data.rules.length + " registered facts and rules",
                    icon: BookOpen,
                  },
                  {
                    label: "Open evidence gaps",
                    value: openTasks.length,
                    note: "Every gap has a next step",
                    icon: GitBranch,
                  },
                ].map((s) => (
                  <div className="stat" key={s.label}>
                    <div>
                      <span>{s.label}</span>
                      <s.icon size={17} />
                    </div>
                    <strong>{s.value.toString().padStart(2, "0")}</strong>
                    <p>{s.note}</p>
                  </div>
                ))}
              </section>
              <div className="overview-grid">
                <section className="panel recent">
                  <div className="panel-header">
                    <div>
                      <h2>Content at a glance</h2>
                      <p>Your latest work, with its review status.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("Content studio")}
                    >
                      View all
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {contentTable(data.content.slice(0, 5))}
                </section>
                <section className="panel activity">
                  <div className="panel-header">
                    <div>
                      <h2>The latest activity</h2>
                      <p>A traceable trail of decisions.</p>
                    </div>
                    <History size={18} />
                  </div>
                  <div className="activity-list">
                    {data.activity.slice(0, 5).map((a, i) => (
                      <div className="activity-item" key={a.id}>
                        <span className={"activity-dot dot-" + i}>
                          <Check size={13} />
                        </span>
                        <div>
                          <b>{a.action}</b>
                          <p>{a.target}</p>
                          <small>
                            {a.actor} · {formatDate(a.created)}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="activity-footer"
                    onClick={() => go("Time machine")}
                  >
                    Explore the audit trail
                    <ArrowUpRight size={15} />
                  </button>
                </section>
              </div>
              <div className="evidence-note">
                <ShieldCheck size={17} />
                <span>
                  No verifiable evidence, no factual verdict. Evidence gaps
                  remain <b>Unverified</b>.
                </span>
                <button onClick={() => go("Rulebook & sources")}>
                  Explore your rulebook
                  <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
          {view === "Content studio" &&
            (active ? (
              <Editor
                key={active.id + ":" + active.version}
                item={active}
                data={data}
                busy={busy}
                action={action}
                back={() => setSelected(null)}
                receipt={receiptModal}
                notify={notify}
                setModal={setModal}
              />
            ) : (
              <ContentLibrary items={data.content} table={contentTable} />
            ))}
          {view === "Review desk" && (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Decisions waiting for you</h2>
                  <p>Review findings and exact versions before approving.</p>
                </div>
                <Badge value={`${reviewQueue.length} in queue`} />
              </div>
              {contentTable(reviewQueue)}
            </section>
          )}
          {view === "Rulebook & sources" && (
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
                          title: "Import approved material",
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
                      Explicit values, named owners and approved supporting
                      material.
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
                            <small className="block muted">{r.subject}</small>
                          </td>
                          <td>{r.value}</td>
                          <td>{sourceName(r.source_id)}</td>
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
          {view === "Claim DNA" && (
            <Lineage data={data} onOpen={(id) => go("Content studio", id)} />
          )}
          {view === "Source conflicts" && (
            <ConflictView reloadKey={data.workspace.revision} />
          )}
          {view === "Knowledge gaps" && (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>The evidence to find next</h2>
                  <p>Closing a task cannot override an unsupported claim.</p>
                </div>
                <Badge value={`${openTasks.length} Open`} />
              </div>
              {data.tasks.length ? (
                <div className="task-list">
                  {data.tasks.map((t) => (
                    <div className="task-row" key={t.id}>
                      <span className="task-icon">
                        <CircleHelp size={21} />
                      </span>
                      <div>
                        <h3>{t.title}</h3>
                        <p>
                          {
                            data.content.find((c) => c.id === t.content_id)
                              ?.title
                          }{" "}
                          · Owner: {t.owner}
                        </p>
                      </div>
                      <Badge value={t.status} />
                      <button
                        className="button small"
                        onClick={() => go("Content studio", t.content_id)}
                      >
                        Open content
                        <ArrowUpRight size={14} />
                      </button>
                      {reviewer && t.status === "Open" && (
                        <button
                          className="icon-button"
                          aria-label="Close resolved task"
                          onClick={() =>
                            action(
                              "/tasks/" + t.id + "/close",
                              "POST",
                              undefined,
                              "Task closed",
                            )
                          }
                        >
                          <Check size={17} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="No evidence tasks yet">
                  Scanning content creates an owner task for each mapped
                  evidence gap.
                </Empty>
              )}
            </section>
          )}
          {view === "Visual checks" && (
            <>
              <VisualIntelligence
                manager={manager}
                enabled={!!data.workspace.settings.ai_enabled}
              />
              <VisualChecks />
            </>
          )}
          {view === "Campaigns" && (
            <CampaignView
              data={data}
              go={go}
              manager={manager}
              setModal={setModal}
              submit={submitModal}
            />
          )}
          {view === "Impact lab" && (
            <ImpactLab data={data} manager={manager} ruleForm={ruleForm} />
          )}
          {view === "Time machine" && (
            <>
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Approval archive</h2>
                    <p>
                      Each receipt preserves the content and evidence at the
                      moment of approval.
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
                  <Empty
                    icon={History}
                    title="History begins with your first approval"
                  >
                    Approve a reviewed draft to create an immutable receipt.
                  </Empty>
                )}
              </section>
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Workspace audit trail</h2>
                    <p>Recorded actions, in reverse chronological order.</p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>ACTION</th>
                        <th>RECORD</th>
                        <th>WHO</th>
                        <th>WHEN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.activity.map((a) => (
                        <tr key={a.id}>
                          <td>{a.action}</td>
                          <td>{a.target}</td>
                          <td>{a.actor}</td>
                          <td className="muted">
                            {new Date(a.created).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {view === "Learning loop" && (
            <Learning data={data} ruleForm={ruleForm} manager={manager} />
          )}
          {view === "Partner workspace" && (
            <>
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>People & permissions</h2>
                    <p>
                      Partners can access only campaigns explicitly assigned to
                      them.
                    </p>
                  </div>
                  {manager && (
                    <button
                      className="button"
                      onClick={() =>
                        setModal({
                          title: "Create a workspace member",
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
                                  {[
                                    "creator",
                                    "reviewer",
                                    "partner",
                                    "manager",
                                  ].map((r) => (
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
                                  ? "Demo members get fictional internal email addresses and cannot sign in outside this sandbox. Use the role controls to switch between the four sample teammates."
                                  : "This creates an account directly. No invitation email is sent."}
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
                      Assignments are enforced by the API on every content
                      request.
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
          {view === "Privacy & settings" && (
            <>
              <section className="privacy-hero">
                <LockKeyhole size={32} />
                <div>
                  <h2>Human control. Visible boundaries.</h2>
                  <p>
                    Rules-only checks run on your API server. External AI stays
                    off unless a manager enables a configured provider.
                  </p>
                </div>
                <Badge
                  value={
                    data.workspace.settings.ai_enabled
                      ? "AI enabled"
                      : "Rules only"
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
                          ? "Provider configured. Suggestions still need evidence validation and human review."
                          : "No provider configured. Deterministic checks are available."}
                      </p>
                    </div>
                    <button
                      className={
                        "toggle " +
                        (data.workspace.settings.ai_enabled ? "on" : "")
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
                  <ul className="privacy-list">
                    <li>
                      <Check size={16} />
                      No automatic publishing or approval.
                    </li>
                    <li>
                      <Check size={16} />
                      Email and phone masking before optional AI calls.
                    </li>
                    <li>
                      <Check size={16} />
                      Text review sends the draft and applicable rules.
                    </li>
                    <li>
                      <Check size={16} />
                      OCR and logo analysis send the selected images or PDF to
                      the configured provider.
                    </li>
                  </ul>
                  <p className="form-note">
                    Masking is not complete anonymisation. Confirm the
                    provider’s terms before using confidential content.
                  </p>
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
                    <dt>AI provider</dt>
                    <dd>
                      {data.ai_configured
                        ? `${data.ai_provider} configured`
                        : "Not configured"}
                    </dd>
                    <dt>Record history</dt>
                    <dd>Versioned content and approval snapshots</dd>
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
                    Content deletion removes stored text and review notes while
                    retaining receipt hashes and audit metadata. Backups require
                    a separate retention policy.
                  </p>
                </section>
              </div>
              <div className="evidence-note">
                <CircleHelp size={17} />
                <span>
                  Access is checked on every API request. Workspace managers
                  control accounts, campaign assignments and AI settings.
                </span>
              </div>
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
          Saving changes…
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
function ContentLibrary({
  items,
  table,
}: {
  items: Row[];
  table: (x: Row[]) => React.ReactNode;
}) {
  const [filter, setFilter] = useState("All content");
  const groups = [
    "All content",
    "Draft",
    "Needs changes",
    "In review",
    "Approved",
    "Needs reassessment",
  ];
  return (
    <section className="panel">
      <div className="tabs">
        {groups.map((g) => (
          <button
            key={g}
            className={filter === g ? "active" : ""}
            onClick={() => setFilter(g)}
          >
            {g}
            <span>
              {g === "All content"
                ? items.length
                : items.filter((i) => i.status === g).length}
            </span>
          </button>
        ))}
      </div>
      {table(
        filter === "All content"
          ? items
          : items.filter((c) => c.status === filter),
      )}
    </section>
  );
}

function Editor({
  item,
  data,
  busy,
  action,
  back,
  receipt,
  notify,
  setModal,
}: {
  item: Row;
  data: Data;
  busy: boolean;
  action: any;
  back: () => void;
  receipt: (r: Row) => void;
  notify: (s: string) => void;
  setModal: (m: Modal) => void;
}) {
  const [body, setBody] = useState(item.body),
    [title, setTitle] = useState(item.title),
    [evidence, setEvidence] = useState<string | null>(null);
  const dirty = body !== item.body || title !== item.title,
    canEdit =
      data.user.role === "manager" ||
      (["creator", "partner"].includes(data.user.role) &&
        item.author_id === data.user.id),
    canReview =
      ["manager", "reviewer"].includes(data.user.role) &&
      ![item.author_id, item.last_editor_id].includes(data.user.id);
  const save = async () =>
    action(
      "/content/" + item.id,
      "PUT",
      { body, title, expected_version: item.version },
      "New version saved",
    );
  const scanNow = async () => {
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    await action(
      "/content/" + item.id + "/scan",
      "POST",
      undefined,
      "Evidence check complete",
    );
  };
  const approvals = data.approvals.filter((a) => a.content_id === item.id);
  return (
    <>
      <div className="editor-toolbar">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={15} />
          All content
        </button>
        <div>
          <Badge value={item.status} />
          <span className="version">
            Version {item.version}
            {dirty ? " · Unsaved changes" : ""}
          </span>
        </div>
      </div>
      <div className="editor-grid">
        <section className="panel editor-paper">
          <div className="paper-head">
            <span className="channel">{item.channel}</span>
            <span>
              {data.campaigns.find((c) => c.id === item.campaign_id)?.name}
            </span>
            <MoreHorizontal size={18} />
          </div>
          <label className="sr-only" htmlFor="draft-title">
            Content title
          </label>
          <input
            id="draft-title"
            className="draft-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
          />
          <label className="draft-label" htmlFor="draft-body">
            YOUR MESSAGE
          </label>
          <textarea
            id="draft-body"
            className="draft-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            disabled={!canEdit}
          />
          <div className="paper-meta">
            <span>{body.length} / 5,000 characters</span>
            <span>Subject: {item.subject}</span>
          </div>
          <div className="editor-actions">
            <button
              className="button primary"
              disabled={busy || !body.trim()}
              onClick={scanNow}
            >
              <ScanLine size={16} />
              {dirty ? "Save & check" : "Run evidence check"}
            </button>
            {canEdit && (
              <button
                className="button"
                disabled={busy || !dirty}
                onClick={save}
              >
                Save draft
              </button>
            )}
          </div>
          <div className="editor-note">
            <LockKeyhole size={14} />
            {item.scan_coverage}. Content is never published automatically.
          </div>
          <TranslationPanel
            item={item}
            canEdit={canEdit && !dirty}
            canReview={canReview && !dirty}
            enabled={!!data.workspace.settings.ai_enabled}
            action={action}
          />
          <div className="review-actions">
            <div>
              <h3>Ready for a human decision?</h3>
              <p>
                Approval locks in this exact version and its supporting
                evidence.
              </p>
            </div>
            {canEdit && (
              <button
                className="button"
                disabled={busy || dirty || !item.scan_hash}
                onClick={() =>
                  action(
                    "/content/" + item.id + "/request-review",
                    "POST",
                    undefined,
                    "Sent to the review desk",
                  )
                }
              >
                <Send size={15} />
                Request review
              </button>
            )}
            {canReview && (
              <button
                className="button primary"
                disabled={busy || dirty || item.status !== "In review"}
                onClick={() =>
                  action(
                    "/content/" + item.id + "/approve",
                    "POST",
                    undefined,
                    "Exact version approved",
                  )
                }
              >
                <ShieldCheck size={16} />
                Approve version
              </button>
            )}
            {item.author_id === data.user.id && (
              <small>You cannot approve your own content.</small>
            )}
          </div>
          {approvals.length > 0 && (
            <div className="editor-receipts">
              <h4>Approval records</h4>
              {approvals.map((a) => (
                <button key={a.id} onClick={() => receipt(a)}>
                  <ShieldCheck size={16} />
                  Version {a.version} · {a.snapshot.reviewer}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          )}
          {data.user.role === "manager" && (
            <button
              className="text-button danger-text"
              onClick={() =>
                setModal({
                  title: "Delete this content?",
                  body: (
                    <div className="form">
                      <p>
                        Stored draft text, version text and review notes will be
                        removed. Receipt hashes and audit metadata remain. This
                        cannot be undone.
                      </p>
                      <button
                        className="button danger"
                        onClick={async () => {
                          const r = await action(
                            "/content/" + item.id,
                            "DELETE",
                            undefined,
                            "Content payload deleted",
                          );
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
              <Trash2 size={14} />
              Delete content payload
            </button>
          )}
        </section>
        <aside className="panel findings-panel">
          <div className="panel-header">
            <div>
              <h2>Evidence check</h2>
              <p>
                {item.findings.length} finding
                {item.findings.length !== 1 ? "s" : ""} ·{" "}
                {item.scan_hash ? "Current saved scan" : "Not scanned"}
              </p>
            </div>
            <span className="scan-icon">
              <ScanLine size={20} />
            </span>
          </div>
          {dirty && (
            <div className="inline-note">
              Save and check your changes to refresh these findings.
            </div>
          )}
          {item.findings.length === 0 ? (
            <Empty
              title={
                item.scan_hash
                  ? "No issues in checked rules"
                  : "Let’s check your message"
              }
            >
              {item.scan_hash
                ? "No deterministic issues were found in the scoped register. Human review is still required."
                : "Run an evidence check to see exact spans and their supporting sources."}
            </Empty>
          ) : (
            <div className="findings-list">
              {item.findings.map((f: Row) => (
                <article
                  className={"finding " + (f.resolved ? "resolved" : "")}
                  key={f.id}
                >
                  <div className="finding-top">
                    <Badge
                      value={
                        f.resolved
                          ? "Human resolved"
                          : f.outcome === "Evidence Gap"
                            ? "Evidence Gap · Unverified"
                            : f.outcome
                      }
                    />
                    <span>{f.rule_code}</span>
                  </div>
                  <h3>{f.title}</h3>
                  {f.span && <blockquote>“{f.span}”</blockquote>}
                  <p>{f.message}</p>
                  {f.suggestion && (
                    <div className="suggestion">
                      <small>SUGGESTED CORRECTION</small>
                      <span>{f.suggestion}</span>
                      {canEdit && (
                        <button
                          onClick={() => {
                            if (f.span && !body.includes(f.span)) {
                              notify("This text changed. Run a fresh check.");
                              return;
                            }
                            setBody(
                              f.span
                                ? body.replace(f.span, f.suggestion)
                                : body + " " + f.suggestion,
                            );
                          }}
                        >
                          Use suggestion
                          <ArrowUpRight size={13} />
                        </button>
                      )}
                    </div>
                  )}
                  {f.evidence && (
                    <button
                      className="evidence-link"
                      onClick={() =>
                        setEvidence(evidence === f.id ? null : f.id)
                      }
                    >
                      <BookOpen size={14} />
                      {f.evidence.title} · v{f.evidence.version}
                      <ChevronDown size={14} />
                    </button>
                  )}
                  {evidence === f.id && f.evidence && (
                    <div className="evidence-excerpt">
                      <small>APPROVED EXCERPT</small>
                      <p>{f.evidence.excerpt}</p>
                      <span>Owner: {f.evidence.owner}</span>
                    </div>
                  )}
                  {canReview &&
                    f.outcome === "Low Confidence" &&
                    !f.resolved && (
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({
                            title: "Record your review decision",
                            body: (
                              <Form
                                button="Resolve with reason"
                                onSubmit={async (v) => {
                                  const r = await action(
                                    "/content/" + item.id + "/resolve",
                                    "POST",
                                    { finding_id: f.id, reason: v.reason },
                                    "Human resolution recorded",
                                  );
                                  if (r) setModal(null);
                                }}
                              >
                                <p className="form-note">
                                  Confirm the evidence and applicability before
                                  resolving uncertainty. Your reason is retained
                                  in the audit trail.
                                </p>
                                <Field label="Evidence and reasoning">
                                  <textarea
                                    name="reason"
                                    rows={4}
                                    minLength={10}
                                    required
                                  />
                                </Field>
                              </Form>
                            ),
                          })
                        }
                      >
                        Resolve with a reason
                        <ArrowRight size={14} />
                      </button>
                    )}
                </article>
              ))}
            </div>
          )}
          <div className="finding-foot">
            <ShieldCheck size={15} />A citation establishes traceability, not
            independent truth.
          </div>
        </aside>
      </div>
    </>
  );
}

function Lineage({
  data,
  onOpen,
}: {
  data: Data;
  onOpen: (id: string) => void;
}) {
  const [ruleId, setRuleId] = useState(data.rules[0]?.id || "");
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
                  onClick={() => go("Content studio", c.id)}
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
function ImpactLab({
  data,
  manager,
  ruleForm,
}: {
  data: Data;
  manager: boolean;
  ruleForm: (r: Row) => void;
}) {
  const [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="impact-layout">
      <section className="panel settings-panel">
        <span className="feature-icon">
          <FlaskConical size={26} />
        </span>
        <h2>Try the change first.</h2>
        <p className="muted">
          Replay a proposed value against stored content. Live sources and
          approval records stay unchanged.
        </p>
        <Form
          button={busy ? "Replaying…" : "Preview impact"}
          busy={busy}
          onSubmit={async (v) => {
            setBusy(true);
            try {
              setResult(await api("/impact", "POST", v));
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Fact or policy to change">
            <select name="rule_id">
              {data.rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.title} ({r.value})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Proposed value">
            <input name="value" placeholder="e.g. 599" required />
          </Field>
        </Form>
        <div className="dry-note">
          <LockKeyhole size={16} />
          Dry run · nothing will be published
        </div>
        {error && <div className="error">{error}</div>}
      </section>
      <section className="panel impact-results">
        <div className="panel-header">
          <div>
            <h2>Change impact</h2>
            <p>
              {result
                ? `${result.rule}: ${result.from} → ${result.to}`
                : "A safe place to ask “what if?”"}
            </p>
          </div>
          {result && <Badge value="Dry run" />}
        </div>
        {!result ? (
          <Empty icon={GitBranch} title="See the connections before committing">
            Choose an approved value and preview which content depends on it.
          </Empty>
        ) : (
          <>
            <div className="impact-summary">
              <strong>{result.affected.length}</strong>
              <span>content items connected to this change</span>
            </div>
            {result.affected.map((c: Row) => (
              <div className="task-row" key={c.id}>
                <FileText size={19} />
                <div>
                  <h3>{c.title}</h3>
                  <p>
                    {c.channel} · {c.before} findings now → {c.after} after
                    change
                  </p>
                </div>
                <Badge value={c.status} />
              </div>
            ))}
            <p className="form-note padded">
              {result.message} To publish, update the approved source excerpt
              and then revise its rule in the rulebook.
            </p>
            {manager && (
              <div className="padded">
                <button
                  className="button"
                  onClick={() => {
                    const r = data.rules.find((r) => r.code === result.rule);
                    if (r) ruleForm(r);
                  }}
                >
                  Open rule editor
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
function Learning({
  data,
  ruleForm,
  manager,
}: {
  data: Data;
  ruleForm: (r: Row) => void;
  manager: boolean;
}) {
  const groups = data.rules.map((r) => ({
    ...r,
    decisions: data.decisions.filter((d) => d.rule_id === r.id),
    findings: data.content.flatMap((c) =>
      c.findings.filter((f: Row) => f.rule_id === r.id),
    ),
  }));
  return (
    <>
      <div className="learning-intro">
        <Sparkles size={28} />
        <div>
          <h2>Better rules begin with better questions.</h2>
          <p>
            Patterns below come from recorded findings and human decisions. They
            describe rules, never score people.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Rule health</h2>
            <p>Review repeated uncertainty before proposing a clearer rule.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>RULE</th>
                <th>CURRENT FINDINGS</th>
                <th>HUMAN RESOLUTIONS</th>
                <th>NEXT STEP</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="rule-code">{r.code}</span>
                    <b>{r.title}</b>
                  </td>
                  <td>{r.findings.length}</td>
                  <td>{r.decisions.length}</td>
                  <td>
                    {r.decisions.length
                      ? "Review the recorded reasons"
                      : "Collect review decisions"}
                    {manager && (
                      <button
                        className="text-button"
                        onClick={() => ruleForm(r)}
                      >
                        Review rule
                        <ArrowUpRight size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>What reviewers recorded</h2>
        </div>
        {data.decisions.length ? (
          data.decisions.map((d) => (
            <div className="decision-row" key={d.id}>
              <Badge value={d.outcome} />
              <p>{d.reason}</p>
              <small>
                {d.actor} · {formatDate(d.created)}
              </small>
            </div>
          ))
        ) : (
          <Empty icon={Sparkles} title="Let real decisions lead the way">
            Human resolutions will appear here. No patterns or improvements have
            been invented.
          </Empty>
        )}
      </section>
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
