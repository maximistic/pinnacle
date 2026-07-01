import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateHistoricalTransactions, type RecurringRule } from "@/lib/recurringEngine";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const rule = await prisma.recurringRule.findUnique({ where: { id } });
    if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    const txns = await generateHistoricalTransactions(rule as RecurringRule);
    return NextResponse.json({ count: txns.length });
  } catch (err) {
    console.error("Backfill error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
