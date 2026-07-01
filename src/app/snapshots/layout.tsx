import type { Metadata } from "next";
export const metadata: Metadata = { title: "Snapshots — Pinnacle", description: "Track your net worth over time." };
export default function SnapshotsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
