import type React from "react";

export type Row = { id: string; title: any; code: any; [key: string]: any };
export type Data = {
  user: Row;
  workspace: Row;
  demo: boolean;
  judge_demo: { expires: string; ai_limit: number; roles: string[] } | null;
  ai_configured: boolean;
  ai_provider: string | null;
  vision_configured?: boolean;
  members: Row[];
  campaigns: Row[];
  sources: Row[];
  rules: Row[];
  content: Row[];
  creatives: Row[];
  approvals: Row[];
  dependencies: Row[];
  tasks: Row[];
  decisions: Row[];
  activity: Row[];
};
export type Modal = { title: string; body: React.ReactNode } | null;
export type Action = (
  path: string,
  method?: string,
  body?: unknown,
  message?: string,
) => Promise<any>;

export const MODULES = [
  "Company Hub",
  "Scan & Detect",
  "Verify & Review",
  "Fix & Approve",
  "Impact Monitor",
  "Trust & Audit",
] as const;
export type Module = (typeof MODULES)[number];
export type View = "Home" | Module;

export async function api(path: string, method = "GET", body?: unknown) {
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
          : Array.isArray(data.detail)
            ? data.detail
                .map((d: any) => d.msg || JSON.stringify(d))
                .join(" ")
            : JSON.stringify(data.detail);
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

/* One visual language for every finding: colour, label, confidence and next step. */
export type Tone = "red" | "orange" | "yellow" | "blue" | "green" | "grey";
export function outcomeMeta(f: Row): {
  tone: Tone;
  label: string;
  confidence: string;
  next: string;
  group: "critical" | "gap" | "review" | "visual" | "info";
} {
  if (f.resolved)
    return {
      tone: "grey",
      label:
        f.review?.state === "AI finding rejected"
          ? "Rejected by reviewer"
          : "Resolved by reviewer",
      confidence: "Human decision recorded",
      next: "No action needed. The reason is kept in the audit trail.",
      group: "info",
    };
  if (f.outcome === "Visual Violation")
    return {
      tone: "red",
      label: "Visual brand violation",
      confidence: f.engine?.startsWith("Demo")
        ? "Predefined demo finding"
        : "AI visual comparison · needs human confirmation",
      next: "Replace the logo with the approved reference and upload the revised creative.",
      group: "visual",
    };
  if (
    f.outcome === "Verified Contradiction" ||
    f.outcome === "Projected Contradiction"
  )
    return {
      tone: "red",
      label: "Confirmed contradiction",
      confidence: "High · exact match against an approved value",
      next: "Replace it with the approved value, then re-check.",
      group: "critical",
    };
  if (f.outcome === "Evidence Gap")
    return {
      tone: "orange",
      label: "Evidence gap",
      confidence: "High · mapped as unsupported in the evidence library",
      next: "Remove the claim, rewrite it with an approved claim, or request evidence.",
      group: "gap",
    };
  if (f.engine === "AI-assisted")
    return {
      tone: "blue",
      label: "AI suggestion",
      confidence: "Low · AI-assisted, citation validated, not proof",
      next: "A reviewer decides whether it applies and records why.",
      group: "review",
    };
  return {
    tone: "yellow",
    label: "Needs human review",
    confidence: "Low · requires reviewer judgement",
    next:
      f.title === "Confirm this claim’s support"
        ? "Map the claim to approved evidence in Company Hub, or remove it."
        : "A reviewer decides whether it applies and records why.",
    group: "review",
  };
}

export const formatDate = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const formatTime = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/* Findings in reading order. Visual findings sort by their box, text findings by position. */
export function orderedFindings(item: Row, creative?: Row | null): Row[] {
  const regionY = (f: Row) => {
    if (f.kind === "visual") return f.box?.[0] ?? 0;
    const r = creative?.regions?.find(
      (x: Row) => f.start < x.end && f.end > x.start,
    );
    return r ? r.box[0] : 1000;
  };
  return [...(item.findings || [])].sort((a, b) =>
    creative
      ? regionY(a) - regionY(b) || a.start - b.start
      : a.start - b.start || (a.kind === "visual" ? -1 : 1),
  );
}

export function contentCreative(data: Data, item: Row): Row | null {
  return (
    data.creatives?.find(
      (c) => c.content_id === item.id && c.version === item.version,
    ) || null
  );
}
export function originalCreative(data: Data, item: Row): Row | null {
  const list = (data.creatives || []).filter((c) => c.content_id === item.id);
  return list.sort((a, b) => a.version - b.version)[0] || null;
}

export function download(name: string, data: unknown, type = "application/json") {
  const url = URL.createObjectURL(
    new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], {
      type,
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Word-level diff for the original/corrected comparison. */
export function wordDiff(a: string, b: string) {
  const A = a.match(/\s+|[^\s]+/g) || [],
    B = b.match(/\s+|[^\s]+/g) || [];
  const n = A.length,
    m = B.length;
  const L: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { type: "same" | "del" | "add"; text: string }[] = [];
  let i = 0,
    j = 0;
  const push = (type: "same" | "del" | "add", text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) push("del", A[i++]);
    else push("add", B[j++]);
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("add", B[j++]);
  return out;
}
