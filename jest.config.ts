import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { module: "commonjs" } }],
  },
  moduleDirectories: ["node_modules", "<rootDir>"],
  watchPathIgnorePatterns: ["<rootDir>/.claude/"],
  modulePathIgnorePatterns: ["<rootDir>/.claude/"],
};

export default config;
