import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { target } = body as { target: string };

  if (target === "holdings") {
    await prisma.holding.deleteMany();
    await prisma.recurringRule.deleteMany();
    return NextResponse.json({ ok: true });
  }
  if (target === "snapshots") {
    await prisma.snapshot.deleteMany();
    return NextResponse.json({ ok: true });
  }
  if (target === "all") {
    await prisma.holding.deleteMany();
    await prisma.recurringRule.deleteMany();
    await prisma.snapshot.deleteMany();
    await prisma.setting.deleteMany();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid target" }, { status: 400 });
}
