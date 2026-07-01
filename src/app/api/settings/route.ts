import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.setting.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    if (!map.snapshotFrequency) map.snapshotFrequency = process.env.SNAPSHOT_FREQUENCY ?? "OFF";
    return NextResponse.json(map);
  } catch (err) {
    console.error("GET settings error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const pairs = Object.entries(body).filter(([ , v]) => typeof v === "string") as [string, string][];
    if (pairs.length === 0) return NextResponse.json({ ok: true });
    await prisma.$transaction(
      pairs.map(([key, value]) =>
        prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
      )
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH settings error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
