// Mock prisma to prevent Prisma client ESM issues in test environment
jest.mock("@/lib/prisma", () => ({
  prisma: {
    holding: {
      findMany: jest.fn(),
      update:   jest.fn(),
    },
  },
}));

import { fetchMFNav, fetchIndianStockPrice, fetchUSStockPrice } from "../priceFetcher";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

describe("fetchMFNav", () => {
  it("returns NAV from valid response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ nav: "123.45" }] }),
    });
    const result = await fetchMFNav("122639");
    expect(result).toBe(123.45);
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const result = await fetchMFNav("122639");
    expect(result).toBeNull();
  });

  it("returns null on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const result = await fetchMFNav("122639");
    expect(result).toBeNull();
  });

  it("returns null on malformed JSON (missing data array)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await fetchMFNav("122639");
    expect(result).toBeNull();
  });
});

describe("fetchIndianStockPrice", () => {
  it("parses regularMarketPrice correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chart: { result: [{ meta: { regularMarketPrice: 2500.75 } }] },
      }),
    });
    const result = await fetchIndianStockPrice("RELIANCE");
    expect(result).toBe(2500.75);
  });

  it("returns null when regularMarketPrice is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ chart: { result: [{ meta: {} }] } }),
    });
    const result = await fetchIndianStockPrice("RELIANCE");
    expect(result).toBeNull();
  });

  it("returns null on bad response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const result = await fetchIndianStockPrice("RELIANCE");
    expect(result).toBeNull();
  });
});

describe("fetchUSStockPrice", () => {
  it("returns USD price without .NS suffix", async () => {
    const capturedUrl: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      capturedUrl.push(url);
      return Promise.resolve({
        ok: true,
        json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 185.5 } }] } }),
      });
    });
    const result = await fetchUSStockPrice("AAPL");
    expect(result).toBe(185.5);
    expect(capturedUrl[0]).not.toContain(".NS");
    expect(capturedUrl[0]).toContain("AAPL");
  });
});
