import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.snapshot.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
