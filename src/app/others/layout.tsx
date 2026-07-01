import type { Metadata } from "next";
export const metadata: Metadata = { title: "Others — Pinnacle", description: "Manage FDs, RDs, gold, EPFO, and other assets." };
export default function OthersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
