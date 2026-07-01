import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { batchUpdatePrices } from "@/lib/priceFetcher";

const RATE_LIMIT_MINUTES = 15;

export async function POST() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "lastPriceRefresh" } });

    if (setting) {
      const lastCall = new Date(setting.value);
      const diffMs   = Date.now() - lastCall.getTime();
      const diffMins = Math.floor(diffMs / 60_000);
      if (diffMins < RATE_LIMIT_MINUTES) {
        return NextResponse.json(
          { error: "Rate limit", retryAfterMinutes: RATE_LIMIT_MINUTES - diffMins },
          { status: 429 }
        );
      }
    }

    await prisma.setting.upsert({
      where: { key: "lastPriceRefresh" },
      update: { value: new Date().toISOString() },
      create: { key: "lastPriceRefresh", value: new Date().toISOString() },
    });

    const result = await batchUpdatePrices();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Price refresh error:", err);
    return NextResponse.json({ error: "Failed to refresh prices" }, { status: 500 });
  }
}
