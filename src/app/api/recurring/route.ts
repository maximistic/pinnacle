import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const holdingId = searchParams.get("holdingId");
    const rules = await prisma.recurringRule.findMany({
      where: holdingId ? { holdingId } : undefined,
      include: { holding: { select: { name: true, type: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(rules);
  } catch (err) {
    console.error("GET recurring rules error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const {
    name,
    ruleType,
    amount,
    startDate: startDateRaw,
    holdingId,
    frequency,
    dayOfMonth,
    endDate: endDateRaw,
    interestRate,
    tenureMonths,
    employerMatch,
    notes,
  } = body;

  if (!name || typeof name !== "string" || !name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!["SIP", "RD", "EPFO", "CUSTOM"].includes(ruleType))
    return NextResponse.json({ error: "ruleType must be SIP | RD | EPFO | CUSTOM" }, { status: 400 });
  if (typeof amount !== "number" || amount <= 0)
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });

  const startDate = new Date(startDateRaw);
  if (isNaN(startDate.getTime()))
    return NextResponse.json({ error: "startDate is invalid" }, { status: 400 });

  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  if (endDateRaw && isNaN(endDate!.getTime()))
    return NextResponse.json({ error: "endDate is invalid" }, { status: 400 });

  // For SIP rules linked to an existing holding with transactions, set lastRunDate
  // to the latest transaction date so the cron only fires for future installments
  let lastRunDate: Date | null = null;
  if (ruleType === "SIP" && holdingId) {
    const latestTxn = await prisma.transaction.findFirst({
      where: { holdingId },
      orderBy: { date: "desc" },
    });
    if (latestTxn) lastRunDate = latestTxn.date;
  }

  const rule = await prisma.recurringRule.create({
    data: {
      name: name.trim(),
      ruleType,
      amount,
      startDate,
      endDate: endDate ?? null,
      holdingId: holdingId ?? null,
      frequency: frequency ?? "MONTHLY",
      dayOfMonth: dayOfMonth ?? 1,
      interestRate: interestRate ?? null,
      tenureMonths: tenureMonths ?? null,
      employerMatch: employerMatch ?? null,
      lastRunDate,
      notes: notes ?? null,
    },
  });

  return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    console.error("POST recurring rule error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
