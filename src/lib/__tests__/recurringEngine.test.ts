// Mock prisma before importing the engine
jest.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: jest.fn(),
      create:   jest.fn(),
    },
    holding: {
      update: jest.fn(),
    },
    recurringRule: {
      update: jest.fn(),
    },
  },
}));

import { getNextDueDate, isDue } from "../recurringEngine";

function makeRule(overrides: Partial<Parameters<typeof getNextDueDate>[0]> = {}): Parameters<typeof getNextDueDate>[0] {
  return {
    id:           "rule1",
    holdingId:    "holding1",
    name:         "Test SIP",
    ruleType:     "SIP",
    amount:       5000,
    frequency:    "MONTHLY",
    dayOfMonth:   1,
    startDate:    new Date("2024-01-01"),
    endDate:      null,
    interestRate: null,
    tenureMonths: null,
    employerMatch: null,
    lastRunDate:  null,
    status:       "ACTIVE",
    notes:        null,
    ...overrides,
  };
}

describe("getNextDueDate", () => {
  it("returns first installment date when lastRunDate is null", () => {
    const rule  = makeRule({ startDate: new Date("2024-01-15"), dayOfMonth: 1 });
    const next  = getNextDueDate(rule);
    // day 1 comes BEFORE Jan 15, so next is Feb 1
    expect(next.getUTCFullYear()).toBe(2024);
    expect(next.getUTCMonth()).toBe(1);  // Feb (0-indexed)
    expect(next.getUTCDate()).toBe(1);
  });

  it("returns next month same day after lastRunDate", () => {
    const rule = makeRule({
      startDate:   new Date("2024-01-01"),
      dayOfMonth:  1,
      lastRunDate: new Date("2024-06-01"),
    });
    const next = getNextDueDate(rule);
    expect(next.getUTCMonth()).toBe(6);  // July
    expect(next.getUTCDate()).toBe(1);
  });
});

describe("isDue", () => {
  it("returns true when next due date is in the past", () => {
    const rule = makeRule({
      lastRunDate: new Date("2024-01-01"),
      dayOfMonth:  1,
      startDate:   new Date("2024-01-01"),
    });
    const asOf = new Date("2024-03-15");
    expect(isDue(rule, asOf)).toBe(true);
  });

  it("returns false for PAUSED rules", () => {
    const rule = makeRule({ status: "PAUSED" });
    const asOf = new Date("2025-01-01");
    expect(isDue(rule, asOf)).toBe(false);
  });

  it("returns false when rule already ran today", () => {
    const today = new Date("2024-07-01");
    const rule  = makeRule({ lastRunDate: new Date("2024-07-01"), dayOfMonth: 1 });
    // getNextDueDate will return Aug 1, which is after today
    expect(isDue(rule, today)).toBe(false);
  });
});
