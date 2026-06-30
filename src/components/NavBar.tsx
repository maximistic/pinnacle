"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/stocks", label: "Stocks" },
  { href: "/mutual-funds", label: "Mutual Funds" },
  { href: "/others", label: "Others" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800 bg-background sticky top-0 z-40">
      <nav className="flex items-center gap-1 px-6 h-12">
        <span className="text-sm font-bold tracking-tight mr-4 text-foreground">
          Pinnacle
        </span>
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                isActive
                  ? "bg-neutral-100 dark:bg-neutral-800 text-foreground font-medium"
                  : "text-neutral-500 hover:text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-900"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
