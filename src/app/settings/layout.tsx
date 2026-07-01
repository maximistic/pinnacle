import type { Metadata } from "next";
export const metadata: Metadata = { title: "Settings — Pinnacle", description: "Configure Pinnacle settings." };
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
