"use client";

import { useRef, useState } from "react";
import CASReviewTable, { type ParsedFund } from "@/components/CASReviewTable";

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

type Step = "upload" | "review";

export default function UploadPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedFunds, setParsedFunds] = useState<ParsedFund[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) {
      setError("Please select a PDF file.");
      return;
    }
    setLoading(true);
    setError(null);
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
        setError(data.error ?? "Failed to parse CAS PDF.");
        return;
      }
      setParsedFunds(data.funds ?? []);
      setStep("review");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSampleData() {
    setParsedFunds(SAMPLE_FUNDS);
    setStep("review");
  }

  function handleReset() {
    setStep("upload");
    setFile(null);
    setPassword("");
    setError(null);
    setParsedFunds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSave(rows: ParsedFund[]) {
    // Prompt 3 will wire up real save logic
    console.log("[CAS Upload] Approved funds to save:", rows);
  }

  return (
    <main className="p-6 text-foreground">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-edge">
        <h1 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          Upload CAS
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

      {/* ── Upload step ── */}
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
                  setError(null);
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

          {/* Error */}
          {error && (
            <div className="px-3 py-2 text-xs border border-loss/40 text-loss bg-loss/5">
              {error}
            </div>
          )}

          {/* Loading hint */}
          {loading && (
            <p className="text-[11px] text-muted animate-pulse">
              Parsing CAS PDF — this may take a few seconds…
            </p>
          )}

          {/* Help text */}
          {!loading && !error && (
            <p className="text-[11px] text-muted/60 leading-relaxed">
              Upload a CAMS or KFintech Consolidated Account Statement. The PDF
              is processed server-side and never stored.
            </p>
          )}
        </div>
      )}

      {/* ── Review step ── */}
      {step === "review" && parsedFunds.length === 0 && (
        <div className="text-sm text-muted py-8">
          No funds were found in the statement.{" "}
          <button
            onClick={handleReset}
            className="text-amber hover:underline"
          >
            Try re-uploading.
          </button>
        </div>
      )}

      {step === "review" && parsedFunds.length > 0 && (
        <CASReviewTable funds={parsedFunds} onSave={handleSave} />
      )}
    </main>
  );
}
