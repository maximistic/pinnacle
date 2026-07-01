import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const holding = await prisma.holding.findUnique({ where: { id } });
  if (!holding) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }

  const transactions = await prisma.transaction.findMany({
    where: { holdingId: id },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(transactions);
}
