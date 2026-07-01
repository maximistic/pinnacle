import { prisma } from "@/lib/prisma";

// Mirrors the Prisma-generated RecurringRule shape (structural typing)
export type RecurringRule = {
  id: string;
  holdingId: string | null;
  name: string;
  ruleType: string;
  amount: number;
  frequency: string;
  dayOfMonth: number;
  startDate: Date;
  endDate: Date | null;
  interestRate: number | null;
  tenureMonths: number | null;
  employerMatch: number | null;
  lastRunDate: Date | null;
  status: string;
  notes: string | null;
};

type CreatedTx = {
  id: string;
  holdingId: string;
  date: Date;
  description: string;
  amount: number | null;
  units: number | null;
  nav: number | null;
  balance: number | null;
  type: string | null;
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function clampDay(year: number, month0: number, day: number): Date {
  const maxDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month0, Math.min(day, maxDay)));
}

function addPeriods(base: Date, periods: number, dom: number): Date {
  const m = base.getUTCMonth() + periods;
  return clampDay(
    base.getUTCFullYear() + Math.floor(m / 12),
    ((m % 12) + 12) % 12,
    dom
  );
}

// Shared core used by both getNextDueDate and generateHistoricalTransactions
function computeNextDue(
  frequency: string,
  dom: number,
  startDate: Date,
  lastRunDate: Date | null
): Date {
  if (frequency === "WEEKLY") {
    if (!lastRunDate) return new Date(startDate);
    const d = new Date(lastRunDate);
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }

  const periods = frequency === "QUARTERLY" ? 3 : 1;

  if (!lastRunDate) {
    const candidate = clampDay(startDate.getUTCFullYear(), startDate.getUTCMonth(), dom);
    return candidate >= startDate ? candidate : addPeriods(candidate, periods, dom);
  }

  return addPeriods(new Date(lastRunDate), periods, dom);
}

// ── Exported engine functions ─────────────────────────────────────────────────

/** Returns the next due date for a recurring rule based on its frequency and last run date. */
export function getNextDueDate(rule: RecurringRule): Date {
  return computeNextDue(
    rule.frequency,
    rule.dayOfMonth,
    new Date(rule.startDate),
    rule.lastRunDate ? new Date(rule.lastRunDate) : null
  );
}

/** Returns true if a rule is ACTIVE and its next due date is on or before the given date. */
export function isDue(rule: RecurringRule, asOf: Date): boolean {
  if (rule.status !== "ACTIVE") return false;
  const nextDue = getNextDueDate(rule);
  if (nextDue > asOf) return false;
  if (rule.endDate && nextDue > new Date(rule.endDate)) return false;
  return true;
}

/** Processes a due recurring rule: creates a transaction and updates the holding's invested value. */
export async function processRule(rule: RecurringRule): Promise<CreatedTx | null> {
  if (!rule.holdingId) return null;

  const holding = await prisma.holding.findUnique({ where: { id: rule.holdingId } });
  if (!holding) return null;

  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let description: string;
  let txnType: string;
  let amount: number;

  switch (rule.ruleType) {
    case "SIP":
      description = `SIP — ${rule.name}`;
      txnType = "SIP";
      amount = rule.amount;
      break;
    case "RD":
      description = `RD Installment — ${rule.name}`;
      txnType = "RD_INSTALLMENT";
      amount = rule.amount;
      break;
    case "EPFO": {
      const employer = rule.employerMatch ?? 0;
      description = `EPFO — Employee: ₹${rule.amount} + Employer: ₹${employer}`;
      txnType = "EPFO";
      amount = rule.amount + employer;
      break;
    }
    default:
      description = `Recurring — ${rule.name}`;
      txnType = "RECURRING";
      amount = rule.amount;
  }

  const txn = await prisma.transaction.create({
    data: {
      holdingId: rule.holdingId,
      date: todayUTC,
      description,
      type: txnType,
      amount,
      units: null,
      nav: null,
      balance: null,
    },
  });

  await prisma.holding.update({
    where: { id: rule.holdingId },
    data: { investedValue: { increment: amount } },
  });

  await prisma.recurringRule.update({
    where: { id: rule.id },
    data: { lastRunDate: todayUTC },
  });

  return txn;
}

/** Generates all missing historical transactions for RD and EPFO rules up to today. */
export async function generateHistoricalTransactions(rule: RecurringRule): Promise<CreatedTx[]> {
  if (!["RD", "EPFO"].includes(rule.ruleType) || !rule.holdingId) return [];

  const isEpfo = rule.ruleType === "EPFO";
  const txnType = isEpfo ? "EPFO" : "RD_INSTALLMENT";
  const employer = rule.employerMatch ?? 0;
  const txnAmount = isEpfo ? rule.amount + employer : rule.amount;
  const txnDescription = isEpfo
    ? `EPFO — Employee: ₹${rule.amount} + Employer: ₹${employer}`
    : `RD Installment — ${rule.name}`;

  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cutoff = rule.endDate
    ? new Date(Math.min(todayUTC.getTime(), new Date(rule.endDate).getTime()))
    : todayUTC;

  const startDate = new Date(rule.startDate);

  // Collect all due dates up to cutoff
  const dueDates: Date[] = [];
  let cursor: Date | null = null;

  while (true) {
    const next = computeNextDue(rule.frequency, rule.dayOfMonth, startDate, cursor);
    if (next > cutoff) break;
    dueDates.push(next);
    cursor = next;
  }

  if (dueDates.length === 0) return [];

  // Fetch existing transactions of the appropriate type to deduplicate
  const existing = await prisma.transaction.findMany({
    where: {
      holdingId: rule.holdingId,
      type: txnType,
      date: { gte: startDate, lte: cutoff },
    },
    select: { date: true },
  });

  const existingKeys = new Set(existing.map((t) => t.date.toISOString().slice(0, 10)));
  const newDates = dueDates.filter((d) => !existingKeys.has(d.toISOString().slice(0, 10)));

  if (newDates.length === 0) return [];

  const created: CreatedTx[] = [];
  for (const date of newDates) {
    const txn = await prisma.transaction.create({
      data: {
        holdingId: rule.holdingId,
        date,
        description: txnDescription,
        type: txnType,
        amount: txnAmount,
        units: null,
        nav: null,
        balance: null,
      },
    });
    created.push(txn);
  }

  if (created.length > 0) {
    await prisma.holding.update({
      where: { id: rule.holdingId },
      data: { investedValue: { increment: txnAmount * created.length } },
    });
  }

  return created;
}
