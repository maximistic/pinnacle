import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  const holdings = await prisma.holding.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(holdings);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { type, name, quantity, investedValue, currentValue, notes } = body;

  if (!type || !name || investedValue == null || currentValue == null) {
    return NextResponse.json(
      { error: "type, name, investedValue, and currentValue are required" },
      { status: 400 }
    );
  }

  const holding = await prisma.holding.create({
    data: {
      type,
      name,
      quantity: quantity ?? null,
      investedValue,
      currentValue,
      notes: notes ?? null,
      source: "MANUAL",
    },
  });

  return NextResponse.json(holding, { status: 201 });
}
