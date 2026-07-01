import type { Metadata } from "next";
export const metadata: Metadata = { title: "Stocks — Pinnacle", description: "Manage your stock holdings." };
export default function StocksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
