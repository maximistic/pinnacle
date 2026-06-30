"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/stocks", label: "Stocks" },
  { href: "/mutual-funds", label: "Mutual Funds" },
  { href: "/others", label: "Others" },
  { href: "/upload", label: "Upload CAS" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: horizontal top bar */}
      <header className="md:hidden flex items-center gap-0.5 h-12 px-4 border-b border-edge bg-surface shrink-0 sticky top-0 z-40">
        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-amber mr-4">
          PINNACLE
        </span>
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-widest transition-colors ${
                isActive
                  ? "text-amber"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </header>

      {/* Desktop: left sidebar */}
      <aside className="hidden md:flex flex-col w-55 sticky top-0 h-screen border-r border-edge bg-surface shrink-0">
        <div className="px-6 py-5 border-b border-edge">
          <span className="text-[11px] font-semibold tracking-[0.25em] uppercase text-amber">
            PINNACLE
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 p-3 pt-4">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] border-l-2 transition-colors ${
                  isActive
                    ? "border-amber text-amber bg-amber/5"
                    : "border-transparent text-muted hover:text-foreground hover:bg-white/3"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
