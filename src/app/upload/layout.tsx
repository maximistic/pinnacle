import type { Metadata } from "next";
export const metadata: Metadata = { title: "Upload CAS — Pinnacle", description: "Upload your Consolidated Account Statement." };
export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
