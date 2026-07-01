import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
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
  } catch (err) {
    console.error("GET transactions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
