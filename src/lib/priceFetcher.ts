/**
 * Price fetching utilities for automatic portfolio value updates.
 * All functions return null on error and never throw.
 */

import { prisma } from "@/lib/prisma";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const BATCH_SIZE   = 5;
const BATCH_DELAY  = 500;

/** Fetch current NAV for a mutual fund by AMFI scheme code. */
export async function fetchMFNav(amfiCode: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${amfiCode}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const nav = parseFloat(json?.data?.[0]?.nav);
    return isNaN(nav) ? null : nav;
  } catch {
    return null;
  }
}

/** Search for AMFI scheme code by fund name. Returns first match's schemeCode or null. */
export async function searchAmfiCode(name: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.mfapi.in/mf/search?q=${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const code = json?.[0]?.schemeCode;
    return code != null ? String(code) : null;
  } catch {
    return null;
  }
}

/** Fetch current price for an Indian NSE stock (appends .NS to ticker). */
export async function fetchIndianStockPrice(ticker: string): Promise<number | null> {
  return fetchYahooPrice(`${ticker}.NS`);
}

/** Fetch current price for a US stock in USD. */
export async function fetchUSStockPrice(ticker: string): Promise<number | null> {
  return fetchYahooPrice(ticker);
}

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

type BatchResult = { updated: number; failed: number; skipped: number };

/**
 * Fetch and update prices for all priceable holdings.
 * - MUTUAL_FUND: uses amfi code (auto-discovers if missing)
 * - STOCK: uses ticker field
 * - US_STOCK (currency="USD"): uses ticker field, multiplies by exchangeRate
 * Skips holdings where lastPriceFetchedAt is within the last 6 hours.
 * Processes in batches of 5 with 500ms delays between batches.
 */
export async function batchUpdatePrices(): Promise<BatchResult> {
  const holdings = await prisma.holding.findMany({
    where: {
      OR: [
        { type: "STOCK" },
        { type: "MUTUAL_FUND" },
        { type: "US_STOCK" },
        { AND: [{ type: "OTHER" }, { currency: "USD" }] },
      ],
    },
  });

  const now = new Date();
  const cutoff = new Date(now.getTime() - SIX_HOURS_MS);

  let updated = 0;
  let failed  = 0;
  let skipped = 0;

  async function processOne(h: typeof holdings[0]) {
    if (h.lastPriceFetchedAt && h.lastPriceFetchedAt > cutoff) {
      skipped++;
      return;
    }

    try {
      if (h.type === "MUTUAL_FUND") {
        let amfiCode = h.amfi;

        // Auto-discover AMFI code if missing
        if (!amfiCode) {
          const found = await searchAmfiCode(h.name);
          if (found) {
            amfiCode = found;
            await prisma.holding.update({ where: { id: h.id }, data: { amfi: found } });
          }
        }

        if (!amfiCode) { skipped++; return; }

        const nav = await fetchMFNav(amfiCode);
        if (nav === null) { failed++; return; }

        const qty = h.quantity ?? 0;
        const newCurrent = qty > 0 ? nav * qty : nav; // fallback for MFs without units tracked
        await prisma.holding.update({
          where: { id: h.id },
          data: { currentValue: newCurrent, lastPriceFetchedAt: now },
        });
        updated++;

      } else if (h.type === "STOCK") {
        const ticker = h.ticker;
        if (!ticker) { skipped++; return; }

        const price = await fetchIndianStockPrice(ticker);
        if (price === null) { failed++; return; }

        const qty = h.quantity ?? 1;
        await prisma.holding.update({
          where: { id: h.id },
          data: { currentValue: price * qty, lastPriceFetchedAt: now },
        });
        updated++;

      } else if (h.type === "US_STOCK" || (h.type === "OTHER" && h.currency === "USD")) {
        const ticker = h.ticker ?? h.isin; // isin was used as ticker for US stocks before ticker field
        if (!ticker) { skipped++; return; }

        const usdPrice = await fetchUSStockPrice(ticker);
        if (usdPrice === null) { failed++; return; }

        const rate = h.exchangeRate ?? 84;
        const qty  = h.quantity ?? 1;
        await prisma.holding.update({
          where: { id: h.id },
          data: { currentValue: usdPrice * qty * rate, lastPriceFetchedAt: now },
        });
        updated++;
      } else {
        skipped++;
      }
    } catch {
      failed++;
    }
  }

  for (let i = 0; i < holdings.length; i += BATCH_SIZE) {
    const batch = holdings.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(processOne));
    if (i + BATCH_SIZE < holdings.length) {
      await new Promise<void>((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  return { updated, failed, skipped };
}
