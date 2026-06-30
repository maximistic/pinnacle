import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { type, name, quantity, investedValue, currentValue, notes, source } = body;

  const existing = await prisma.holding.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }

  const holding = await prisma.holding.update({
    where: { id },
    data: {
      ...(type !== undefined && { type }),
      ...(name !== undefined && { name }),
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
