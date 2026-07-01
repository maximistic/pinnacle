import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const snapshots = await prisma.snapshot.findMany({
    orderBy: { date: "asc" },
  });
  return NextResponse.json(snapshots);
}

export async function POST() {
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

  // Upsert: find any snapshot already recorded today (UTC calendar date)
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfNextDay = new Date(startOfDay.getTime() + 86_400_000);

  const existing = await prisma.snapshot.findFirst({
    where: {
      date: { gte: startOfDay, lt: startOfNextDay },
    },
  });

  const snapshot = existing
    ? await prisma.snapshot.update({
        where: { id: existing.id },
        data: { date: now, totalValue, breakdown },
      })
    : await prisma.snapshot.create({
        data: { totalValue, breakdown },
      });

  return NextResponse.json(snapshot, { status: existing ? 200 : 201 });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body.all === true) {
    const result = await prisma.snapshot.deleteMany();
    return NextResponse.json({ count: result.count });
  }
  const ids: string[] = body.ids ?? [];
  if (ids.length === 0) return NextResponse.json({ count: 0 });
  const result = await prisma.snapshot.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ count: result.count });
}
