"use client";
import { useEffect, useState } from "react";
import {
  ScanLine,
  Languages,
  Upload,
  ShieldCheck,
  Download,
  Sparkles,
} from "lucide-react";

type RecordData = Record<string, any>;
async function request(path: string, method = "GET", body?: unknown) {
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
  const data = await response.json();
  if (!response.ok)
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : "The request could not be completed. Check the input and try again.",
    );
  return data;
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function AIStatus() {
  const [status, setStatus] = useState<RecordData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    request("/intelligence/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel settings-panel">
      <span className="feature-icon">
        <Sparkles size={24} />
      </span>
      <h2>AI service status</h2>
      {error && <p className="error">{error}</p>}
      {status && (
        <>
          <p>
            {status.configured
              ? `${status.provider} · ${status.model}`
              : "No provider configured"}
          </p>
          <p className="muted">
            {status.requests_today} / {status.daily_limit} workspace requests
            used today (UTC). Failed provider calls count toward this limit.
          </p>
          <p className="form-note">
            Text assistance masks email and phone details. OCR sends the
            selected image or document to the provider; these files cannot be
            masked before transcription. Translation protects contact details
            and approved names with placeholders. Outputs always need review.
          </p>
        </>
      )}
    </section>
  );
}

export function VisualIntelligence({
  manager,
  enabled,
}: {
  manager: boolean;
  enabled: boolean;
}) {
  const [logos, setLogos] = useState<RecordData[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [file, setFile] = useState<File | null>(null),
    [imageURL, setImageURL] = useState(""),
    [result, setResult] = useState<RecordData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = () => request("/logos").then(setLogos);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!file) {
      setImageURL("");
      return;
    }
    const url = URL.createObjectURL(file);
    setImageURL(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function analyze() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("reference_ids", JSON.stringify(selected));
      setResult(await request("/visual/analyze", "POST", data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel intelligence-wide">
      <span className="feature-icon">
        <ScanLine size={25} />
      </span>
      <h2>Read the creative. Recognise the brand.</h2>
      <p className="muted">
        Extract visible text and compare logos against your approved references.
        PNG, JPEG or WebP · up to 3 MB and 8 megapixels.
      </p>
      {!enabled && (
        <p className="form-note">
          A manager must enable AI services in Privacy & settings before
          analysis.
        </p>
      )}
      <div className="intelligence-columns">
        <div>
          <label className="field">
            Creative image
            <input
              aria-label="Creative for OCR and logo analysis"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResult(null);
              }}
            />
          </label>
          {imageURL && (
            <div className="creative-stage">
              <img
                className="creative-preview"
                src={imageURL}
                alt="Creative selected for analysis"
              />
              {result?.logos
                .filter(
                  (logo: RecordData) =>
                    logo.result !== "not_found" &&
                    logo.box[2] > logo.box[0] &&
                    logo.box[3] > logo.box[1],
                )
                .map((logo: RecordData) => (
                  <div
                    className="logo-box"
                    key={logo.reference_id}
                    style={{
                      top: logo.box[0] / 10 + "%",
                      left: logo.box[1] / 10 + "%",
                      height: (logo.box[2] - logo.box[0]) / 10 + "%",
                      width: (logo.box[3] - logo.box[1]) / 10 + "%",
                    }}
                  >
                    <span>{result.reference_names[logo.reference_id]}</span>
                  </div>
                ))}
            </div>
          )}
          <fieldset className="logo-options">
            <legend>Compare approved logos (up to three)</legend>
            {logos.length === 0 && (
              <p className="muted">
                No approved references yet. OCR still works without one.
              </p>
            )}
            {logos.map((logo) => (
              <label key={logo.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(logo.id)}
                  disabled={
                    busy ||
                    (!selected.includes(logo.id) && selected.length === 3)
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, logo.id]
                        : selected.filter((x) => x !== logo.id),
                    )
                  }
                />
                <img src={logo.image_url} alt={logo.name} />
                <span>{logo.name}</span>
                {manager && (
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await request(
                          "/logos/" + logo.id + "/withdraw",
                          "POST",
                        );
                        setSelected(selected.filter((x) => x !== logo.id));
                        await load();
                        setNotice("Reference withdrawn.");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Withdraw
                  </button>
                )}
              </label>
            ))}
          </fieldset>
          <p className="form-note">
            Analysis sends this image and selected logo references to the
            configured AI provider. Uploaded creatives are not retained by
            Brandora.
          </p>
          <button
            className="button primary"
            disabled={!enabled || !file || busy}
            onClick={analyze}
          >
            <ScanLine size={16} />
            {busy ? "Analysing…" : "Run OCR & logo comparison"}
          </button>
        </div>
        {manager && (
          <form
            className="logo-register"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = e.currentTarget;
              try {
                await request("/logos", "POST", new FormData(form));
                form.reset();
                await load();
                setNotice("Approved logo reference registered.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Approved logo register</h3>
            <p className="muted">
              Register a logo your team is authorised to use. Brandora stores a
              resized reference privately in your workspace.
            </p>
            <label className="field">
              Reference name
              <input
                name="name"
                minLength={2}
                maxLength={100}
                required
                placeholder="Primary wordmark"
              />
            </label>
            <label className="field">
              Approved logo image
              <input
                name="file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
              />
            </label>
            <label className="checkbox-line">
              <input type="checkbox" required />I confirm this is an approved
              brand reference.
            </label>
            <button className="button" disabled={busy}>
              <Upload size={16} />
              Register reference
            </button>
          </form>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="form-note">
          {notice}
        </p>
      )}
      {result && (
        <div className="intelligence-results">
          <div className="panel-header">
            <h3>Analysis for human review</h3>
            <button
              className="button"
              onClick={() => download("brandora-visual-review.json", result)}
            >
              <Download size={15} />
              Download report
            </button>
          </div>
          <p className="form-note">
            AI recognition can miss, misread or misidentify elements. A visual
            match does not prove ownership or authenticity.
          </p>
          <label className="field">
            Extracted text · {result.ocr.language}
            <textarea readOnly rows={6} value={result.ocr.text} />
          </label>
          <p>
            <b>Suggested alt text:</b> {result.suggested_alt_text}
          </p>
          {result.logos.map((logo: RecordData) => (
            <article className="logo-result" key={logo.reference_id}>
              <ShieldCheck size={20} />
              <div>
                <h4>
                  {result.reference_names[logo.reference_id]} ·{" "}
                  {logo.result.replace("_", " ")}
                </h4>
                <p>{logo.explanation}</p>
              </div>
            </article>
          ))}
          {[...result.ocr.warnings, ...result.warnings].map(
            (w: string, i: number) => (
              <p className="form-note" key={i}>
                {w}
              </p>
            ),
          )}
        </div>
      )}
    </section>
  );
}

export function TranslationPanel({
  item,
  canEdit,
  canReview,
  enabled,
  action,
}: {
  item: RecordData;
  canEdit: boolean;
  canReview: boolean;
  enabled: boolean;
  action: (
    path: string,
    method: string,
    body?: unknown,
    message?: string,
  ) => Promise<any>;
}) {
  const [languages, setLanguages] = useState<Record<string, string>>({}),
    [target, setTarget] = useState("hi"),
    [result, setResult] = useState<RecordData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  useEffect(() => {
    request("/intelligence/status")
      .then((r) => setLanguages(r.languages))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setResult(null);
    setError("");
    let active = true;
    request("/content/" + item.id + "/translations")
      .then((rows) => {
        if (active)
          setResult(
            rows.find((r: RecordData) => r.version === item.version) || null,
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [item.id, item.version]);
  return (
    <section className="translation-panel">
      <h3>
        <Languages size={20} />
        Translation & language review
      </h3>
      <p className="muted">
        Generate from the saved version. Names and numeric facts are protected,
        and every translated draft needs a separate language review.
      </p>
      {canEdit && (
        <>
          <div className="translation-controls">
            <label className="field">
              Target language
              <select
                aria-label="Translation language"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {Object.entries(languages).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button"
              disabled={busy || !enabled}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setResult(
                    await request(
                      "/content/" + item.id + "/translate",
                      "POST",
                      { language: target, expected_version: item.version },
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Translating…" : "Generate translation"}
            </button>
          </div>
          {!enabled && (
            <p className="form-note">
              Enable AI services in Privacy & settings to translate.
            </p>
          )}
        </>
      )}
      {result && (
        <>
          <label className="field">
            Translation draft
            <textarea
              lang={result.language}
              dir="auto"
              readOnly
              rows={5}
              value={result.result.translated_text}
            />
          </label>
          <label className="field">
            English back-translation
            <textarea
              readOnly
              rows={4}
              value={result.result.back_translation}
            />
          </label>
          <p className="form-note">
            Protected:{" "}
            {result.result.protected_terms.join(" · ") ||
              "No registered terms or numeric facts"}
          </p>
          {result.result.warnings.map((w: string, i: number) => (
            <p className="form-note" key={i}>
              {w}
            </p>
          ))}
          <button
            className="button primary"
            disabled={busy || !!result.saved_content_id}
            onClick={async () => {
              setBusy(true);
              const saved = await action(
                "/translations/" + result.id + "/save",
                "POST",
                undefined,
                "Translated draft saved to Content studio",
              );
              if (saved) setResult({ ...result, saved_content_id: saved.id });
              setBusy(false);
            }}
          >
            {result.saved_content_id
              ? "Saved in Content studio"
              : "Save as a separate draft"}
          </button>
        </>
      )}
      {(item.language !== "en" || !!item.language_review_required) && (
        <div className="language-review">
          <p>
            <b>Draft language:</b> {languages[item.language] || item.language}
          </p>
          {item.language_review?.content_hash ? (
            <p className="form-note">
              Language review recorded by {item.language_review.reviewer}:{" "}
              {item.language_review.reason}
            </p>
          ) : (
            <p className="form-note">
              Native-language review is required before approval.
            </p>
          )}
          {canReview && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await action(
                  "/content/" + item.id + "/language-review",
                  "POST",
                  { reason, expected_version: item.version },
                  "Language review recorded",
                );
              }}
            >
              <label className="field">
                Confirm meaning, tone, names and numeric claims
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={20}
                  maxLength={1000}
                  required
                  placeholder="Record your review in a language you can assess…"
                />
              </label>
              <button className="button">Record language review</button>
            </form>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
