"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = {
  presetType?: string;
  onSaved: () => void;
  onClose: () => void;
};

// ── Style constants ────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 text-sm font-sans border border-edge bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-amber transition-colors";

const selectCls =
  "w-full px-3 py-2 text-sm font-sans border border-edge bg-background text-foreground focus:outline-none focus:border-amber transition-colors";

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-muted mb-1.5">
        {label}
        {required && <span className="text-loss ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-loss mt-1">{error}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OthersAddModal({ presetType, onSaved, onClose }: Props) {
  const [type, setType] = useState(presetType ?? "FD");

  // Common
  const [name,   setName]   = useState("");

  // FD / GOLD / REAL_ESTATE / OTHER
  const [investedValue, setInvestedValue] = useState("");
  const [currentValue,  setCurrentValue]  = useState("");

  // RD
  const [rdInstallment, setRdInstallment] = useState("");
  const [rdRate,        setRdRate]        = useState("");
  const [rdTenure,      setRdTenure]      = useState("");
  const [rdStartDate,   setRdStartDate]   = useState("");
  const [rdDayOfMonth,  setRdDayOfMonth]  = useState("1");

  // EPFO
  const [epfoEmployee,   setEpfoEmployee]   = useState("");
  const [epfoEmployer,   setEpfoEmployer]   = useState("");
  const [epfoCorpus,     setEpfoCorpus]     = useState("");
  const [epfoStartDate,  setEpfoStartDate]  = useState("");

  // US_STOCK
  const [ticker,         setTicker]         = useState("");
  const [exchange,       setExchange]       = useState("NYSE");
  const [quantity,       setQuantity]       = useState("");
  const [purchasePrice,  setPurchasePrice]  = useState("");
  const [currentPrice,   setCurrentPrice]   = useState("");
  const [exchangeRate,   setExchangeRate]   = useState("");

  // Common
  const [notes, setNotes] = useState("");

  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);

    const trimmedName = name.trim();
    if (!trimmedName) { setSaveError("Name is required."); return; }

    setSaving(true);
    try {
      if (type === "FD" || type === "GOLD" || type === "REAL_ESTATE" || type === "OTHER") {
        const iv = parseFloat(investedValue);
        const cv = parseFloat(currentValue);
        if (isNaN(iv) || iv < 0) { setSaveError("Invested value must be a non-negative number."); return; }
        if (isNaN(cv) || cv < 0) { setSaveError("Current value must be a non-negative number."); return; }

        const res = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, name: trimmedName, investedValue: iv, currentValue: cv, notes: notes.trim() || null }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          setSaveError(d.error ?? "Failed to save.");
          return;
        }
        onSaved();

      } else if (type === "RD") {
        const installment = parseFloat(rdInstallment);
        const rate        = parseFloat(rdRate);
        const tenure      = parseInt(rdTenure, 10);
        const dom         = parseInt(rdDayOfMonth, 10);
        if (isNaN(installment) || installment <= 0) { setSaveError("Monthly installment must be positive."); return; }
        if (isNaN(rate) || rate < 0)                { setSaveError("Interest rate must be non-negative."); return; }
        if (isNaN(tenure) || tenure <= 0)           { setSaveError("Tenure must be a positive number."); return; }
        if (!rdStartDate)                           { setSaveError("Start date is required."); return; }
        if (isNaN(dom) || dom < 1 || dom > 28)     { setSaveError("Day of month must be between 1 and 28."); return; }

        // 1. Create holding
        const holdingRes = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "RD", name: trimmedName, investedValue: 0, currentValue: 0, notes: notes.trim() || null }),
        });
        if (!holdingRes.ok) {
          const d = await holdingRes.json().catch(() => ({})) as { error?: string };
          setSaveError(d.error ?? "Failed to create holding.");
          return;
        }
        const holdingData = await holdingRes.json() as { id: string };
        const holdingId = holdingData.id;

        // 2. Create recurring rule
        const ruleRes = await fetch("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdingId,
            ruleType: "RD",
            name: trimmedName,
            amount: installment,
            interestRate: rate,
            tenureMonths: tenure,
            startDate: rdStartDate,
            dayOfMonth: dom,
            frequency: "MONTHLY",
          }),
        });
        if (!ruleRes.ok) {
          const d = await ruleRes.json().catch(() => ({})) as { error?: string };
          setSaveError(d.error ?? "Failed to create recurring rule.");
          return;
        }
        const ruleData = await ruleRes.json() as { id: string };
        const ruleId = ruleData.id;

        // 3. Backfill historical transactions
        await fetch(`/api/recurring/${ruleId}/backfill`, { method: "POST" });

        // 4. Fetch updated holding to get investedValue
        const updatedRes = await fetch(`/api/holdings/${holdingId}`);
        if (updatedRes.ok) {
          const updatedHolding = await updatedRes.json() as { investedValue: number };
          // 5. Set currentValue = investedValue
          await fetch(`/api/holdings/${holdingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentValue: updatedHolding.investedValue }),
          });
        }

        onSaved();

      } else if (type === "EPFO") {
        const empContrib  = parseFloat(epfoEmployee);
        const erContrib   = parseFloat(epfoEmployer);
        const corpus      = parseFloat(epfoCorpus);
        if (isNaN(empContrib) || empContrib <= 0) { setSaveError("Employee contribution must be positive."); return; }
        if (isNaN(erContrib)  || erContrib <= 0)  { setSaveError("Employer contribution must be positive."); return; }
        if (isNaN(corpus)     || corpus < 0)       { setSaveError("Corpus value must be non-negative."); return; }
        if (!epfoStartDate)                        { setSaveError("Start date is required."); return; }

        // 1. Create holding
        const holdingRes = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "EPFO", name: trimmedName, investedValue: 0, currentValue: corpus, notes: notes.trim() || null }),
        });
        if (!holdingRes.ok) {
          const d = await holdingRes.json().catch(() => ({})) as { error?: string };
          setSaveError(d.error ?? "Failed to create holding.");
          return;
        }
        const holdingData = await holdingRes.json() as { id: string };
        const holdingId = holdingData.id;

        // 2. Create recurring rule
        const ruleRes = await fetch("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdingId,
            ruleType: "EPFO",
            name: trimmedName,
            amount: empContrib,
            employerMatch: erContrib,
            startDate: epfoStartDate,
            dayOfMonth: 28,
            frequency: "MONTHLY",
          }),
        });
        if (!ruleRes.ok) {
          const d = await ruleRes.json().catch(() => ({})) as { error?: string };
          setSaveError(d.error ?? "Failed to create recurring rule.");
          return;
        }
        const ruleData = await ruleRes.json() as { id: string };
        const ruleId = ruleData.id;

        // 3. Backfill historical transactions
        await fetch(`/api/recurring/${ruleId}/backfill`, { method: "POST" });

        onSaved();

      } else if (type === "US_STOCK") {
        const qty      = parseFloat(quantity);
        const purchase = parseFloat(purchasePrice);
        const current  = parseFloat(currentPrice);
        const rate     = parseFloat(exchangeRate);
        const tickerUpper = ticker.trim().toUpperCase();

        if (!tickerUpper)             { setSaveError("Ticker symbol is required."); return; }
        if (isNaN(qty) || qty <= 0)   { setSaveError("Quantity must be a positive number."); return; }
        if (isNaN(purchase) || purchase < 0) { setSaveError("Purchase price must be non-negative."); return; }
        if (isNaN(current)  || current < 0)  { setSaveError("Current price must be non-negative."); return; }
        if (isNaN(rate)     || rate <= 0)    { setSaveError("Exchange rate must be a positive number."); return; }

        const iv = purchase * qty * rate;
        const cv = current  * qty * rate;

        const res = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "US_STOCK",
            name: trimmedName,
            quantity: qty,
            investedValue: iv,
            currentValue: cv,
            isin: tickerUpper,
            folioNumber: exchange,
            currency: "USD",
            exchangeRate: rate,
            notes: notes.trim() || null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          setSaveError(d.error ?? "Failed to save.");
          return;
        }
        onSaved();
      }
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = (t: string) => {
    const map: Record<string, string> = {
      FD: "Fixed Deposit", GOLD: "Gold", REAL_ESTATE: "Real Estate",
      RD: "Recurring Deposit", EPFO: "EPFO", US_STOCK: "US Stock", OTHER: "Other",
    };
    return map[t] ?? t;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm border border-edge bg-surface p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-[10px] uppercase tracking-widest text-muted mb-5">Add Holding</h2>

        {saveError && (
          <div className="mb-4 px-3 py-2 text-[10px] border border-loss/40 text-loss bg-loss/5">
            {saveError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Type selector */}
          <Field label="Type" required>
            <select value={type} onChange={(e) => { setType(e.target.value); setSaveError(null); }} className={selectCls}>
              {["FD","GOLD","REAL_ESTATE","RD","EPFO","US_STOCK","OTHER"].map((v) => (
                <option key={v} value={v} style={{ background: "#131615" }}>{typeLabel(v)}</option>
              ))}
            </select>
          </Field>

          {/* Name — always shown */}
          <Field label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Enter name"
            />
          </Field>

          {/* FD / GOLD / REAL_ESTATE / OTHER */}
          {(type === "FD" || type === "GOLD" || type === "REAL_ESTATE" || type === "OTHER") && (
            <>
              <Field label="Invested Value (₹)" required>
                <input type="number" value={investedValue} onChange={(e) => setInvestedValue(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 100000" />
              </Field>
              <Field label="Current Value (₹)" required>
                <input type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 110000" />
              </Field>
            </>
          )}

          {/* RD */}
          {type === "RD" && (
            <>
              <Field label="Monthly Installment (₹)" required>
                <input type="number" value={rdInstallment} onChange={(e) => setRdInstallment(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 5000" />
              </Field>
              <Field label="Annual Interest Rate (%)" required>
                <input type="number" value={rdRate} onChange={(e) => setRdRate(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 6.5" />
              </Field>
              <Field label="Tenure (months)" required>
                <input type="number" value={rdTenure} onChange={(e) => setRdTenure(e.target.value)} min="1" step="1" className={inputCls} placeholder="e.g. 24" />
              </Field>
              <Field label="Start Date" required>
                <input type="date" value={rdStartDate} onChange={(e) => setRdStartDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Day of Month (1–28)">
                <input type="number" value={rdDayOfMonth} onChange={(e) => setRdDayOfMonth(e.target.value)} min="1" max="28" step="1" className={inputCls} />
              </Field>
            </>
          )}

          {/* EPFO */}
          {type === "EPFO" && (
            <>
              <Field label="Employee Monthly Contribution (₹)" required>
                <input type="number" value={epfoEmployee} onChange={(e) => setEpfoEmployee(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 1800" />
              </Field>
              <Field label="Employer Monthly Contribution (₹)" required>
                <input type="number" value={epfoEmployer} onChange={(e) => setEpfoEmployer(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 1800" />
              </Field>
              <Field label="Current Corpus Value (₹)" required>
                <input type="number" value={epfoCorpus} onChange={(e) => setEpfoCorpus(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 250000" />
              </Field>
              <Field label="Start Date" required>
                <input type="date" value={epfoStartDate} onChange={(e) => setEpfoStartDate(e.target.value)} className={inputCls} />
              </Field>
            </>
          )}

          {/* US_STOCK */}
          {type === "US_STOCK" && (
            <>
              <Field label="Ticker Symbol" required>
                <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} className={inputCls} placeholder="e.g. AAPL" />
              </Field>
              <Field label="Exchange">
                <select value={exchange} onChange={(e) => setExchange(e.target.value)} className={selectCls}>
                  <option value="NYSE" style={{ background: "#131615" }}>NYSE</option>
                  <option value="NASDAQ" style={{ background: "#131615" }}>NASDAQ</option>
                </select>
              </Field>
              <Field label="Quantity" required>
                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 10" />
              </Field>
              <Field label="Purchase Price (USD)" required>
                <input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 150.00" />
              </Field>
              <Field label="Current Price (USD)" required>
                <input type="number" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 175.00" />
              </Field>
              <Field label="Exchange Rate USD → INR" required>
                <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} min="0" step="any" className={inputCls} placeholder="e.g. 84.50" />
              </Field>
            </>
          )}

          {/* Notes — always shown */}
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="Optional notes…"
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
