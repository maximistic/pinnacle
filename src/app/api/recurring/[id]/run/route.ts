import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processRule, type RecurringRule } from "@/lib/recurringEngine";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const rule = await prisma.recurringRule.findUnique({ where: { id } });
    if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    const txn = await processRule(rule as RecurringRule);

    if (!txn) {
      return NextResponse.json(
        { error: "Rule has no linked holding or holding not found" },
        { status: 422 }
      );
    }

    return NextResponse.json({ transaction: txn }, { status: 201 });
  } catch (err) {
    console.error("Run rule error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
