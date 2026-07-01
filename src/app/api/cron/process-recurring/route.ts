import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDue, processRule, type RecurringRule } from "@/lib/recurringEngine";

async function takeSnapshot() {
  const holdings = await prisma.holding.findMany();
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const breakdown = holdings.reduce<Record<string, { invested: number; current: number }>>(
    (acc, h) => {
      if (!acc[h.type]) acc[h.type] = { invested: 0, current: 0 };
      acc[h.type].invested += h.investedValue;
      acc[h.type].current += h.currentValue;
      return acc;
    },
    {}
  );

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfNextDay = new Date(startOfDay.getTime() + 86_400_000);

  const existing = await prisma.snapshot.findFirst({
    where: { date: { gte: startOfDay, lt: startOfNextDay } },
  });

  if (existing) {
    await prisma.snapshot.update({
      where: { id: existing.id },
      data: { date: now, totalValue, breakdown },
    });
  } else {
    await prisma.snapshot.create({ data: { totalValue, breakdown } });
  }
}

function shouldSnapshot(freq: string, now: Date): boolean {
  if (freq === "DAILY") return true;
  if (freq === "WEEKLY") return now.getUTCDay() === 1; // Monday
  if (freq === "MONTHLY") return now.getUTCDate() === 1;
  return false;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("Authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // Process all due recurring rules
  const rules = await prisma.recurringRule.findMany({ where: { status: "ACTIVE" } });

  const processed: string[] = [];
  const failed: string[] = [];

  for (const rule of rules) {
    if (isDue(rule as RecurringRule, now)) {
      try {
        const txn = await processRule(rule as RecurringRule);
        if (txn) processed.push(rule.name);
      } catch {
        failed.push(rule.name);
      }
    }
  }

  // Auto-snapshot
  const snapFreq = (process.env.SNAPSHOT_FREQUENCY ?? "OFF").toUpperCase();
  let snapshotCreated = false;

  if (shouldSnapshot(snapFreq, now)) {
    try {
      await takeSnapshot();
      snapshotCreated = true;
    } catch {
      // snapshot failure is non-fatal
    }
  }

  return NextResponse.json({
    processed,
    failed,
    snapshotCreated,
    timestamp: now.toISOString(),
  });
}
