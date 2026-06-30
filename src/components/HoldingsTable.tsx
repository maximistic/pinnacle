"use client";

import { useCallback, useEffect, useState } from "react";

export type Holding = {
  id: string;
  type: string;
  name: string;
  quantity: number | null;
  investedValue: number;
  currentValue: number;
  notes: string | null;
  source: string;
};

export type TypeOption = { value: string; label: string };

type FormState = {
  type: string;
  name: string;
  quantity: string;
  investedValue: string;
  currentValue: string;
};

type Props = {
  title: string;
  addLabel: string;
  apiType?: string;
  filterTypes?: string[];
  fixedType?: string;
  typeOptions?: TypeOption[];
  showQuantity?: boolean;
};

const inputCls =
  "w-full px-3 py-2 text-sm font-sans border border-edge bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-amber transition-colors";

const selectCls =
  "w-full px-3 py-2 text-sm font-sans border border-edge bg-background text-foreground focus:outline-none focus:border-amber transition-colors";

function fmt(n: number) {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-muted mb-1.5">
        {label}
        {required && <span className="text-loss ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function HoldingsTable({
  title,
  addLabel,
  apiType,
  filterTypes,
  fixedType,
  typeOptions,
  showQuantity = true,
}: Props) {
  const showTypeColumn = !!typeOptions;
  const defaultType = typeOptions?.[0]?.value ?? fixedType ?? "";

  function makeEmptyForm(): FormState {
    return { type: defaultType, name: "", quantity: "", investedValue: "", currentValue: "" };
  }

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<null | "add" | string>(null);
  const [form, setForm] = useState<FormState>(makeEmptyForm);
  const [submitting, setSubmitting] = useState(false);

  const filterKey = filterTypes?.join(",");

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = apiType ? `/api/holdings?type=${apiType}` : "/api/holdings";
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data: Holding[] = await res.json();
      const keys = filterKey?.split(",");
      setHoldings(keys ? data.filter((h) => keys.includes(h.type)) : data);
    } catch {
      setError("Could not load holdings.");
    } finally {
      setLoading(false);
    }
  }, [apiType, filterKey]);

  useEffect(() => { fetchHoldings(); }, [fetchHoldings]);

  function openAdd() {
    setForm(makeEmptyForm());
    setModalMode("add");
  }

  function openEdit(h: Holding) {
    setForm({
      type: h.type,
      name: h.name,
      quantity: h.quantity != null ? String(h.quantity) : "",
      investedValue: String(h.investedValue),
      currentValue: String(h.currentValue),
    });
    setModalMode(h.id);
  }

  function closeModal() {
    setModalMode(null);
    setForm(makeEmptyForm());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        type: fixedType ?? form.type,
        name: form.name.trim(),
        quantity: showQuantity && form.quantity !== "" ? parseFloat(form.quantity) : null,
        investedValue: parseFloat(form.investedValue),
        currentValue: parseFloat(form.currentValue),
      };
      const isAdd = modalMode === "add";
      const res = await fetch(
        isAdd ? "/api/holdings" : `/api/holdings/${modalMode}`,
        {
          method: isAdd ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error();
      closeModal();
      await fetchHoldings();
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(h: Holding) {
    if (!confirm(`Delete "${h.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/holdings/${h.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await fetchHoldings();
    } catch {
      alert("Delete failed. Please try again.");
    }
  }

  const totalInvested = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalGain = totalCurrent - totalInvested;

  const colCount = (showTypeColumn ? 1 : 0) + 1 + (showQuantity ? 1 : 0) + 3 + 1;

  return (
    <main className="p-6 text-foreground">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-edge">
        <h1 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          {title}
        </h1>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border border-amber text-amber hover:bg-amber/10 transition-colors"
        >
          + {addLabel}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 text-xs border border-loss/40 text-loss bg-loss/5">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-edge">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface text-muted uppercase text-[10px] tracking-widest border-b border-edge">
              {showTypeColumn && (
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
              )}
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              {showQuantity && (
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
              )}
              <th className="px-4 py-2.5 text-right font-medium">Invested (₹)</th>
              <th className="px-4 py-2.5 text-right font-medium">Current (₹)</th>
              <th className="px-4 py-2.5 text-right font-medium">Gain / Loss</th>
              <th className="px-4 py-2.5 text-center font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-xs text-muted">
                  Loading…
                </td>
              </tr>
            ) : holdings.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-xs text-muted">
                  No entries yet. Add one above.
                </td>
              </tr>
            ) : (
              holdings.map((h) => {
                const gain = h.currentValue - h.investedValue;
                const typeLabel =
                  typeOptions?.find((o) => o.value === h.type)?.label ?? h.type;
                return (
                  <tr
                    key={h.id}
                    className="border-b border-edge hover:bg-white/1.5 transition-colors"
                  >
                    {showTypeColumn && (
                      <td className="px-4 py-2.5 text-xs text-muted">
                        {typeLabel}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-sm text-foreground">{h.name}</td>
                    {showQuantity && (
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-muted tabular-nums">
                        {h.quantity != null ? h.quantity : "—"}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums">
                      {fmt(h.investedValue)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums">
                      {fmt(h.currentValue)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium ${
                        gain >= 0 ? "text-gain" : "text-loss"
                      }`}
                    >
                      {gain >= 0 ? "+" : ""}
                      {fmt(gain)}
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <button
                        onClick={() => openEdit(h)}
                        className="mr-3 text-[10px] uppercase tracking-wider text-amber hover:opacity-70 transition-opacity"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(h)}
                        className="text-[10px] uppercase tracking-wider text-loss hover:opacity-70 transition-opacity"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {!loading && holdings.length > 0 && (
            <tfoot>
              <tr className="border-t border-edge bg-surface">
                {showTypeColumn && <td className="px-4 py-2.5" />}
                <td className="px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted font-semibold">
                  Total
                </td>
                {showQuantity && <td className="px-4 py-2.5" />}
                <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums font-medium">
                  {fmt(totalInvested)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-amber tabular-nums font-medium">
                  {fmt(totalCurrent)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium ${
                    totalGain >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {totalGain >= 0 ? "+" : ""}
                  {fmt(totalGain)}
                </td>
                <td className="px-4 py-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal */}
      {modalMode !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-sm border border-edge bg-surface p-6">
            <h2 className="text-[10px] uppercase tracking-widest text-muted mb-5">
              {modalMode === "add" ? `Add ${addLabel}` : `Edit ${addLabel}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {typeOptions && (
                <Field label="Type" required>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className={selectCls}
                    required
                  >
                    {typeOptions.map((o) => (
                      <option key={o.value} value={o.value} style={{ background: "#131615" }}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Name" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className={inputCls}
                  placeholder="Enter name"
                />
              </Field>
              {showQuantity && (
                <Field label="Quantity">
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    step="any"
                    min="0"
                    className={inputCls}
                    placeholder="e.g. 10"
                  />
                </Field>
              )}
              <Field label="Invested Value (₹)" required>
                <input
                  type="number"
                  value={form.investedValue}
                  onChange={(e) => setForm((f) => ({ ...f, investedValue: e.target.value }))}
                  required
                  step="any"
                  min="0"
                  className={inputCls}
                  placeholder="e.g. 50000"
                />
              </Field>
              <Field label="Current Value (₹)" required>
                <input
                  type="number"
                  value={form.currentValue}
                  onChange={(e) => setForm((f) => ({ ...f, currentValue: e.target.value }))}
                  required
                  step="any"
                  min="0"
                  className={inputCls}
                  placeholder="e.g. 55000"
                />
              </Field>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {submitting ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
