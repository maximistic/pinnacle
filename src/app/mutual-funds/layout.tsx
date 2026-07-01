import type { Metadata } from "next";
export const metadata: Metadata = { title: "Mutual Funds — Pinnacle", description: "Manage your mutual fund portfolio." };
export default function MFLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
