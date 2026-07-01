"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, TrendingUp, PieChart, Wallet, Upload, Camera, Settings, Sun, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

type NavLink = { href: string; label: string; icon: LucideIcon };

const NAV_LINKS: NavLink[] = [
  { href: "/",             label: "Dashboard",    icon: LayoutDashboard },
  { href: "/stocks",       label: "Stocks",       icon: TrendingUp },
  { href: "/mutual-funds", label: "Mutual Funds", icon: PieChart },
  { href: "/others",       label: "Others",       icon: Wallet },
  { href: "/upload",       label: "Upload CAS",   icon: Upload },
  { href: "/snapshots",    label: "Snapshots",    icon: Camera },
  { href: "/settings",     label: "Settings",     icon: Settings },
];

export default function NavBar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      {/* Mobile: horizontal top bar — icon only */}
      <header className="dark md:hidden flex items-center gap-0 h-12 px-3 border-b border-edge bg-surface shrink-0 sticky top-0 z-40">
        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-amber mr-3 shrink-0">
          P
        </span>
        {NAV_LINKS.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center justify-center w-8 h-8 transition-colors ${
                isActive ? "text-amber" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} />
            </Link>
          );
        })}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="ml-auto flex items-center justify-center w-8 h-8 text-muted hover:text-foreground transition-colors"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      {/* Desktop: left sidebar */}
      <aside className="dark hidden md:flex flex-col w-55 sticky top-0 h-screen border-r border-edge bg-surface shrink-0">
        <div className="px-6 py-5 border-b border-edge">
          <span className="text-[11px] font-semibold tracking-[0.25em] uppercase text-amber">
            PINNACLE
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 p-3 pt-4 flex-1">
          {NAV_LINKS.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] border-l-2 transition-colors ${
                  isActive
                    ? "border-amber text-amber bg-amber/5"
                    : "border-transparent text-muted hover:text-foreground hover:bg-white/3"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        {/* Bottom section: Snapshots + Settings */}
        <nav className="flex flex-col gap-0.5 p-3 border-t border-edge">
          {NAV_LINKS.slice(5).map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] border-l-2 transition-colors ${
                  isActive
                    ? "border-amber text-amber bg-amber/5"
                    : "border-transparent text-muted hover:text-foreground hover:bg-white/3"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        {/* Theme toggle */}
        <div className="p-3">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center justify-center w-8 h-8 text-muted hover:text-foreground transition-colors"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>
    </>
  );
}
