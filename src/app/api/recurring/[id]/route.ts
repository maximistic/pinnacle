import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const existing = await prisma.recurringRule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const {
    name,
    amount,
    frequency,
    dayOfMonth,
    endDate: endDateRaw,
    interestRate,
    tenureMonths,
    employerMatch,
    lastRunDate: lastRunRaw,
    status,
    notes,
  } = body;

  if (amount !== undefined && (typeof amount !== "number" || amount <= 0))
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  if (status !== undefined && !["ACTIVE", "PAUSED"].includes(status))
    return NextResponse.json({ error: "status must be ACTIVE or PAUSED" }, { status: 400 });

  const endDate = endDateRaw !== undefined
    ? endDateRaw === null ? null : new Date(endDateRaw)
    : undefined;

  const lastRunDate = lastRunRaw !== undefined
    ? lastRunRaw === null ? null : new Date(lastRunRaw)
    : undefined;

  const rule = await prisma.recurringRule.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(amount !== undefined && { amount }),
      ...(frequency !== undefined && { frequency }),
      ...(dayOfMonth !== undefined && { dayOfMonth: Number(dayOfMonth) }),
      ...(endDate !== undefined && { endDate }),
      ...(interestRate !== undefined && { interestRate }),
      ...(tenureMonths !== undefined && { tenureMonths }),
      ...(employerMatch !== undefined && { employerMatch }),
      ...(lastRunDate !== undefined && { lastRunDate }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
    },
  });

  return NextResponse.json(rule);
  } catch (err) {
    console.error("PATCH recurring rule error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.recurringRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    await prisma.recurringRule.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("DELETE recurring rule error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
