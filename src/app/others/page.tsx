"use client";

import { useState, useEffect } from "react";
import HoldingsTable, { type Holding, type RecurringRuleMeta } from "@/components/HoldingsTable";
import TransactionDrawer from "@/components/TransactionDrawer";
import OthersAddModal from "@/components/OthersAddModal";

// ── Types ──────────────────────────────────────────────────────────────────────

type RuleData = {
  id: string;
  ruleType: string;
  status: string;
  amount: number;
  dayOfMonth: number;
  lastRunDate: string | null;
  startDate: string;
  frequency: string;
  interestRate: number | null;
  tenureMonths: number | null;
  holdingId: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const ALL_TYPE_OPTIONS = [
  { value: "FD",          label: "Fixed Deposit" },
  { value: "GOLD",        label: "Gold" },
  { value: "REAL_ESTATE", label: "Real Estate" },
  { value: "RD",          label: "Recurring Deposit" },
  { value: "EPFO",        label: "EPFO" },
  { value: "US_STOCK",    label: "US Stock" },
  { value: "OTHER",       label: "Other" },
];

const ALL_FILTER_TYPES = ["FD", "GOLD", "REAL_ESTATE", "RD", "EPFO", "US_STOCK", "OTHER"];
const SPECIAL_TYPES    = ["RD", "EPFO", "US_STOCK"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rdMaturity(monthly: number, annualRatePct: number, months: number): number {
  if (annualRatePct === 0) return monthly * months;
  const r = annualRatePct / 100 / 12;
  return monthly * ((Math.pow(1 + r, months) - 1) / r);
}

// Pure client-side next-due computation (MONTHLY)
function clientNextDue(rule: RuleData): Date {
  const dom   = rule.dayOfMonth;
  const start = new Date(rule.startDate);

  function clampDay(year: number, month0: number, day: number): Date {
    const maxDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month0, Math.min(day, maxDay)));
  }

  function addMonths(base: Date, months: number): Date {
    const m = base.getUTCMonth() + months;
    return clampDay(
      base.getUTCFullYear() + Math.floor(m / 12),
      ((m % 12) + 12) % 12,
      dom
    );
  }

  if (!rule.lastRunDate) {
    const candidate = clampDay(start.getUTCFullYear(), start.getUTCMonth(), dom);
    return candidate >= start ? candidate : addMonths(candidate, 1);
  }

  return addMonths(new Date(rule.lastRunDate), 1);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OthersPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [presetType,     setPresetType]     = useState<string | undefined>(undefined);
  const [drawerHolding,  setDrawerHolding]  = useState<Holding | null>(null);

  const [rules,           setRules]           = useState<RuleData[]>([]);
  const [secondaryValues, setSecondaryValues] = useState<Record<string, string>>({});
  const [ruleMap,         setRuleMap]         = useState<Record<string, RecurringRuleMeta>>({});

  // Fetch holdings + rules when refreshTrigger changes
  useEffect(() => {
    async function load() {
      try {
        const [holdingsRes, rulesRes] = await Promise.all([
          fetch("/api/holdings"),
          fetch("/api/recurring"),
        ]);
        if (!holdingsRes.ok || !rulesRes.ok) return;

        const allHoldings: Holding[] = await holdingsRes.json();
        const allRules: RuleData[]   = await rulesRes.json();

        // Filter to Others holdings
        const othersHoldings = allHoldings.filter((h) => ALL_FILTER_TYPES.includes(h.type));
        const othersIds      = new Set(othersHoldings.map((h) => h.id));

        // Filter rules to Others holdings
        const othersRules = allRules.filter((r) => r.holdingId && othersIds.has(r.holdingId));
        setRules(othersRules);

        // Build ruleMap keyed by holdingId
        const newRuleMap: Record<string, RecurringRuleMeta> = {};
        for (const rule of othersRules) {
          if (!rule.holdingId) continue;
          const nextDueDate = clientNextDue(rule);
          newRuleMap[rule.holdingId] = {
            id: rule.id,
            ruleType: rule.ruleType,
            status: rule.status,
            amount: rule.amount,
            dayOfMonth: rule.dayOfMonth,
            nextDue: nextDueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          };
        }
        setRuleMap(newRuleMap);

        // Build secondaryValues
        const sv: Record<string, string> = {};
        for (const rule of othersRules) {
          if (!rule.holdingId) continue;
          if (rule.ruleType === "RD" && rule.interestRate != null && rule.tenureMonths != null) {
            const maturity = rdMaturity(rule.amount, rule.interestRate, rule.tenureMonths);
            sv[rule.holdingId] = `Maturity: ₹${fmt(maturity)}`;
          }
        }
        for (const h of othersHoldings) {
          if (h.type === "US_STOCK" && h.currency === "USD" && h.exchangeRate && h.quantity) {
            const usdPrice = h.currentValue / (h.quantity * h.exchangeRate);
            sv[h.id] = `$${usdPrice.toFixed(2)} @ ₹${h.exchangeRate}/USD`;
          }
        }
        setSecondaryValues(sv);

      } catch { /* ignore */ }
    }
    load();
  }, [refreshTrigger]);

  function handleSpecialTypeAdd(type: string) {
    setPresetType(type);
    setShowAddModal(true);
  }

  function handleRowClick(h: Holding) {
    if (SPECIAL_TYPES.includes(h.type)) {
      setDrawerHolding(h);
    }
  }

  return (
    <>
      <HoldingsTable
        title="Others"
        addLabel="Holding"
        filterTypes={ALL_FILTER_TYPES}
        typeOptions={ALL_TYPE_OPTIONS}
        showQuantity={false}
        specialTypes={SPECIAL_TYPES}
        onSpecialTypeAdd={handleSpecialTypeAdd}
        recurringRulesByHoldingId={ruleMap}
        secondaryValues={secondaryValues}
        externalRefreshTrigger={refreshTrigger}
        onRowClick={handleRowClick}
      />
      {showAddModal && (
        <OthersAddModal
          presetType={presetType}
          onSaved={() => {
            setRefreshTrigger((t) => t + 1);
            setShowAddModal(false);
            setPresetType(undefined);
          }}
          onClose={() => {
            setShowAddModal(false);
            setPresetType(undefined);
          }}
        />
      )}
      <TransactionDrawer holding={drawerHolding} onClose={() => setDrawerHolding(null)} />
    </>
  );
}
