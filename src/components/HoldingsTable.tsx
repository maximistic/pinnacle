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
  /** Single type passed to ?type= query param */
  apiType?: string;
  /** Client-side filter after fetching all holdings */
  filterTypes?: string[];
  /** Fixed type written on create/update (Stocks, MF) */
  fixedType?: string;
  /** When set: shows Type column + dropdown in modal */
  typeOptions?: TypeOption[];
  showQuantity?: boolean;
};

const inputCls =
  "w-full px-2.5 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500";

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
      <label className="block text-xs text-neutral-500 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
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

  // Use a stable string key for filterTypes to avoid re-fetch on reference change
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

  const colCount =
    (showTypeColumn ? 1 : 0) + 1 + (showQuantity ? 1 : 0) + 3 + 1;

  return (
    <main className="p-6 text-foreground">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          + {addLabel}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-neutral-100 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 uppercase text-xs tracking-wider">
              {showTypeColumn && (
                <th className="px-3 py-2 text-left font-medium">Type</th>
              )}
              <th className="px-3 py-2 text-left font-medium">Name</th>
              {showQuantity && (
                <th className="px-3 py-2 text-right font-medium">Qty</th>
              )}
              <th className="px-3 py-2 text-right font-medium">Invested (₹)</th>
              <th className="px-3 py-2 text-right font-medium">Current (₹)</th>
              <th className="px-3 py-2 text-right font-medium">Gain / Loss (₹)</th>
              <th className="px-3 py-2 text-center font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : holdings.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-neutral-400">
                  No entries yet. Add one above.
                </td>
              </tr>
            ) : (
              holdings.map((h, i) => {
                const gain = h.currentValue - h.investedValue;
                const typeLabel =
                  typeOptions?.find((o) => o.value === h.type)?.label ?? h.type;
                return (
                  <tr
                    key={h.id}
                    className={`border-t border-neutral-200 dark:border-neutral-800 ${
                      i % 2 !== 0 ? "bg-neutral-50 dark:bg-neutral-900/40" : ""
                    }`}
                  >
                    {showTypeColumn && (
                      <td className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
                        {typeLabel}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium">{h.name}</td>
                    {showQuantity && (
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                        {h.quantity != null ? h.quantity : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(h.investedValue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(h.currentValue)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        gain >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {gain >= 0 ? "+" : ""}
                      {fmt(gain)}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button
                        onClick={() => openEdit(h)}
                        className="mr-2 text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(h)}
                        className="text-xs text-red-500 hover:underline"
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
              <tr className="border-t-2 border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 font-semibold">
                {showTypeColumn && <td className="px-3 py-2" />}
                <td className="px-3 py-2 text-xs uppercase tracking-wider text-neutral-500">
                  Total
                </td>
                {showQuantity && <td className="px-3 py-2" />}
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(totalInvested)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(totalCurrent)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    totalGain >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {totalGain >= 0 ? "+" : ""}
                  {fmt(totalGain)}
                </td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal */}
      {modalMode !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-background shadow-lg p-5">
            <h2 className="text-sm font-semibold mb-4">
              {modalMode === "add" ? `Add ${addLabel}` : `Edit ${addLabel}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              {typeOptions && (
                <Field label="Type" required>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className={inputCls}
                    required
                  >
                    {typeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
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
                  className="flex-1 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
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
