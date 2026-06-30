import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidType } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { type, name, quantity, investedValue, currentValue, notes, source } = body;

  const existing = await prisma.holding.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }

  // --- Validation (only for fields present in the request body) ---
  if (type !== undefined && !isValidType(type)) {
    return NextResponse.json(
      { error: "Type must be one of: STOCK, MUTUAL_FUND, FD, GOLD, REAL_ESTATE, OTHER" },
      { status: 400 }
    );
  }

  if (name !== undefined) {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
  }

  if (investedValue !== undefined) {
    if (typeof investedValue !== "number" || isNaN(investedValue) || investedValue < 0) {
      return NextResponse.json(
        { error: "Invested value must be a non-negative number" },
        { status: 400 }
      );
    }
  }

  if (currentValue !== undefined) {
    if (typeof currentValue !== "number" || isNaN(currentValue) || currentValue < 0) {
      return NextResponse.json(
        { error: "Current value must be a non-negative number" },
        { status: 400 }
      );
    }
  }

  if (quantity !== undefined && quantity !== null) {
    if (typeof quantity !== "number" || isNaN(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Quantity must be a positive number" },
        { status: 400 }
      );
    }
  }

  const holding = await prisma.holding.update({
    where: { id },
    data: {
      ...(type !== undefined && { type }),
      ...(name !== undefined && { name: (name as string).trim() }),
      ...(quantity !== undefined && { quantity }),
      ...(investedValue !== undefined && { investedValue }),
      ...(currentValue !== undefined && { currentValue }),
      ...(notes !== undefined && { notes }),
      ...(source !== undefined && { source }),
    },
  });

  return NextResponse.json(holding);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const existing = await prisma.holding.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }

  await prisma.holding.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
