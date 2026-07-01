import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidType } from "@/lib/validation";

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
  const { type, name, quantity, investedValue, currentValue, notes, isin, folioNumber, source } = body;

  // --- Validation ---
  if (!isValidType(type)) {
    return NextResponse.json(
      { error: "Type must be one of: STOCK, MUTUAL_FUND, FD, GOLD, REAL_ESTATE, OTHER" },
      { status: 400 }
    );
  }

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (typeof investedValue !== "number" || isNaN(investedValue) || investedValue < 0) {
    return NextResponse.json(
      { error: "Invested value must be a non-negative number" },
      { status: 400 }
    );
  }

  if (typeof currentValue !== "number" || isNaN(currentValue) || currentValue < 0) {
    return NextResponse.json(
      { error: "Current value must be a non-negative number" },
      { status: 400 }
    );
  }

  if (quantity != null) {
    if (typeof quantity !== "number" || isNaN(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Quantity must be a positive number" },
        { status: 400 }
      );
    }
  }

  const trimmedIsin = typeof isin === "string" ? isin.trim() : null;
  const trimmedFolio = typeof folioNumber === "string" ? folioNumber.trim() : null;

  // --- Duplicate / merge check ---
  // Priority 1: ISIN match (only when both incoming and existing have an ISIN)
  let existing = null;
  if (trimmedIsin) {
    existing = await prisma.holding.findFirst({
      where: { type, isin: trimmedIsin },
    });
  }

  // Priority 2: name+type match (case-insensitive) if no ISIN match
  if (!existing) {
    existing = await prisma.holding.findFirst({
      where: {
        type,
        name: { equals: trimmedName, mode: "insensitive" },
      },
    });
  }

  if (existing) {
    const mergedQuantity =
      existing.quantity != null || quantity != null
        ? (existing.quantity ?? 0) + (quantity ?? 0)
        : null;

    const merged = await prisma.holding.update({
      where: { id: existing.id },
      data: {
        quantity: mergedQuantity,
        investedValue: existing.investedValue + investedValue,
        currentValue,
        ...(notes != null && { notes }),
        // Store ISIN if incoming has one and existing does not
        ...(trimmedIsin && !existing.isin && { isin: trimmedIsin }),
        // Always take the latest folio number if provided
        ...(trimmedFolio && { folioNumber: trimmedFolio }),
      },
    });

    return NextResponse.json({ ...merged, merged: true }, { status: 200 });
  }

  // --- Create new ---
  const holding = await prisma.holding.create({
    data: {
      type,
      name: trimmedName,
      quantity: quantity ?? null,
      investedValue,
      currentValue,
      notes: notes ?? null,
      isin: trimmedIsin || null,
      folioNumber: trimmedFolio || null,
      source: source === "CAS_UPLOAD" ? "CAS_UPLOAD" : "MANUAL",
    },
  });

  return NextResponse.json(holding, { status: 201 });
}
