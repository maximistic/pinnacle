"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CASReviewTable, { type ParsedFund } from "@/components/CASReviewTable";

// ── Sample data for testing without a real CAS PDF ────────────────────────────
const SAMPLE_FUNDS: ParsedFund[] = [
  {
    schemeName: "Parag Parikh Flexi Cap Fund - Direct Growth",
    isin: "INF879O01027",
    folioNumber: "12345678",
    units: 245.123,
    investedValue: 50000,
    currentValue: 68500,
    currentNav: 279.45,
  },
  {
    schemeName: "Quant Small Cap Fund - Direct Growth",
    isin: "INF966L01234",
    folioNumber: "98765432",
    units: 120.456,
    investedValue: 30000,
    currentValue: 41200,
    currentNav: 342.1,
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = "upload" | "review" | "saving" | "done";

type SaveProgress = {
  current: number;
  total: number;
  currentName: string;
};

type FailedFund = {
  name: string;
  error: string;
};

type SaveSummary = {
  saved: number;   // new holdings created
  merged: number;  // merged into an existing holding
  failed: FailedFund[];
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function UploadPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedFunds, setParsedFunds] = useState<ParsedFund[]>([]);
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);
  const [saveSummary, setSaveSummary] = useState<SaveSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload & parse ──────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!file) {
      setParseError("Please select a PDF file.");
      return;
    }
    setLoading(true);
    setParseError(null);
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("password", password);

      const res = await fetch("/api/parse-cas", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setParseError(data.error ?? "Failed to parse CAS PDF.");
        return;
      }
      setParsedFunds(data.funds ?? []);
      setStep("review");
    } catch {
      setParseError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSampleData() {
    setParsedFunds(SAMPLE_FUNDS);
    setStep("review");
  }

  // ── Sequential save ─────────────────────────────────────────────────────────
  async function handleSave(rows: ParsedFund[]) {
    setStep("saving");
    setSaveProgress({ current: 1, total: rows.length, currentName: rows[0]?.schemeName ?? "" });

    let saved = 0;
    let merged = 0;
    const failed: FailedFund[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setSaveProgress({ current: i + 1, total: rows.length, currentName: row.schemeName });

      try {
        const res = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "MUTUAL_FUND",
            name: row.schemeName,
            isin: row.isin,
            folioNumber: row.folioNumber,
            quantity: row.units,
            investedValue: row.investedValue,
            currentValue: row.currentValue,
            source: "CAS_UPLOAD",
          }),
        });

        const data: { error?: string; merged?: boolean } = await res.json().catch(() => ({}));

        if (!res.ok) {
          failed.push({ name: row.schemeName, error: data.error ?? `HTTP ${res.status}` });
        } else if (data.merged === true) {
          merged++;
        } else {
          saved++;
        }
      } catch {
        failed.push({ name: row.schemeName, error: "Network error" });
      }
    }

    setSaveSummary({ saved, merged, failed });
    setStep("done");
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  function handleReset() {
    setStep("upload");
    setFile(null);
    setPassword("");
    setParseError(null);
    setParsedFunds([]);
    setSaveProgress(null);
    setSaveSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const totalOk = (saveSummary?.saved ?? 0) + (saveSummary?.merged ?? 0);
  const pct = saveProgress
    ? Math.round((saveProgress.current / saveProgress.total) * 100)
    : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="p-6 text-foreground">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-edge">
        <h1 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          {step === "saving" ? "Importing…" : step === "done" ? "Import Complete" : "Upload CAS"}
        </h1>
        {step === "review" && (
          <button
            onClick={handleReset}
            className="text-[10px] uppercase tracking-wider text-muted hover:text-foreground transition-colors"
          >
            ← Re-upload
          </button>
        )}
      </div>

      {/* ── Upload step ──────────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="max-w-md space-y-5">
          {/* File picker */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted mb-1.5">
              PDF Statement
            </label>
            <label
              htmlFor="cas-file"
              className={`flex items-center justify-between px-3 py-4 border cursor-pointer transition-colors ${
                file
                  ? "border-amber/50 text-foreground"
                  : "border-dashed border-edge text-muted hover:border-amber/40 hover:text-foreground"
              }`}
            >
              <span className="text-sm truncate">
                {file ? file.name : "Click to select a CAS PDF file"}
              </span>
              {file ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="ml-3 shrink-0 text-[10px] text-muted hover:text-loss transition-colors"
                >
                  ✕ Clear
                </button>
              ) : (
                <span className="ml-3 shrink-0 text-[10px] uppercase tracking-widest border border-edge px-2 py-1 text-muted">
                  Browse
                </span>
              )}
              <input
                ref={fileInputRef}
                id="cas-file"
                type="file"
                accept=".pdf"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setParseError(null);
                }}
              />
            </label>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="cas-password"
              className="block text-[10px] uppercase tracking-widest text-muted mb-1.5"
            >
              PDF Password
              <span className="ml-2 normal-case tracking-normal font-normal text-muted/60">
                (usually your PAN number)
              </span>
            </label>
            <input
              id="cas-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) handleUpload();
              }}
              className="w-full px-3 py-2 text-sm font-sans border border-edge bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-amber transition-colors"
              placeholder="e.g. ABCDE1234F"
              autoComplete="current-password"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={loading || !file}
              className="px-4 py-2 text-[10px] uppercase tracking-widest font-semibold border border-amber text-amber hover:bg-amber/10 disabled:opacity-40 transition-colors"
            >
              {loading ? "Parsing…" : "Upload & Parse"}
            </button>
            <button
              onClick={handleSampleData}
              disabled={loading}
              className="px-4 py-2 text-[10px] uppercase tracking-widest font-medium border border-edge text-muted hover:text-foreground hover:border-foreground/30 disabled:opacity-40 transition-colors"
            >
              Use Sample Data
            </button>
          </div>

          {parseError && (
            <div className="px-3 py-2 text-xs border border-loss/40 text-loss bg-loss/5">
              {parseError}
            </div>
          )}

          {loading && (
            <p className="text-[11px] text-muted animate-pulse">
              Parsing CAS PDF — this may take a few seconds…
            </p>
          )}

          {!loading && !parseError && (
            <p className="text-[11px] text-muted/60 leading-relaxed">
              Upload a CAMS or KFintech Consolidated Account Statement. The PDF
              is processed server-side and never stored.
            </p>
          )}
        </div>
      )}

      {/* ── Review step ──────────────────────────────────────────────────────── */}
      {step === "review" && parsedFunds.length === 0 && (
        <div className="text-sm text-muted py-8">
          No funds were found in the statement.{" "}
          <button onClick={handleReset} className="text-amber hover:underline">
            Try re-uploading.
          </button>
        </div>
      )}

      {step === "review" && parsedFunds.length > 0 && (
        <CASReviewTable funds={parsedFunds} onSave={handleSave} />
      )}

      {/* ── Saving step ──────────────────────────────────────────────────────── */}
      {step === "saving" && saveProgress && (
        <div className="max-w-sm py-10 space-y-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-foreground">
              Saving{" "}
              <span className="font-mono font-medium text-amber">
                {saveProgress.current}
              </span>{" "}
              of{" "}
              <span className="font-mono font-medium">
                {saveProgress.total}
              </span>
            </p>
            <span className="text-[11px] font-mono text-muted">{pct}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-px bg-edge overflow-hidden">
            <div
              className="h-full bg-amber transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Current fund name */}
          <p className="text-[11px] text-muted truncate">{saveProgress.currentName}</p>
        </div>
      )}

      {/* ── Done step ────────────────────────────────────────────────────────── */}
      {step === "done" && saveSummary && (
        <div className="max-w-md space-y-5">
          {/* Success banner */}
          <div className="flex items-start gap-3 px-4 py-3.5 border border-gain/30 bg-gain/5">
            <span className="text-gain font-mono text-sm shrink-0">✓</span>
            <p className="text-sm text-foreground">
              <span className="font-medium">
                {totalOk} holding{totalOk !== 1 ? "s" : ""} saved
              </span>
              {saveSummary.merged > 0 && (
                <span className="text-muted">
                  {" "}—{" "}
                  <span className="text-amber font-medium">
                    {saveSummary.merged} merged
                  </span>{" "}
                  with existing
                </span>
              )}
            </p>
          </div>

          {/* Failures */}
          {saveSummary.failed.length > 0 && (
            <div className="border border-loss/30">
              <div className="px-4 py-2 bg-loss/5 border-b border-loss/20">
                <p className="text-[10px] uppercase tracking-widest text-loss font-medium">
                  {saveSummary.failed.length} failed — these were skipped
                </p>
              </div>
              <ul className="divide-y divide-edge">
                {saveSummary.failed.map((f, i) => (
                  <li key={i} className="px-4 py-2.5">
                    <p className="text-xs text-foreground leading-snug">{f.name}</p>
                    <p className="text-[10px] text-loss mt-0.5 font-mono">{f.error}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => router.push("/mutual-funds")}
              className="px-4 py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 transition-opacity"
            >
              Go to Mutual Funds
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Upload Another
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
