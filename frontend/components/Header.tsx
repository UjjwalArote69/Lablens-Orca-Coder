"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";

const NAV = [
  { href: "/", label: "Check a report" },
  { href: "/how-it-works", label: "How it works" },
];

/** The product in miniature: a reference band and one value sitting above it. */
export function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#2557D6" />
      <rect x="6" y="14.5" width="20" height="3" rx="1.5" fill="#FFFFFF" fillOpacity="0.35" />
      <rect x="9" y="14.5" width="10" height="3" fill="#D3ECDF" />
      <circle cx="22.5" cy="16" r="3.5" fill="#FFFFFF" />
    </svg>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [adaption, setAdaption] = useState(false);

  useEffect(() => {
    getHealth()
      .then((h) => setAdaption(h.explanations_source === "adaption"))
      .catch(() => {});
  }, []);

  return (
    <header className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[20px] bg-paper px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-5">
      <Link href="/" className="col-start-1 row-start-1 flex items-center gap-2.5 justify-self-start text-lg font-bold tracking-tight">
        <LogoMark />
        LabLens
      </Link>

      <nav
        aria-label="Main"
        className="col-span-2 col-start-1 row-start-2 flex justify-center gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1"
      >
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active ? "bg-ink text-white" : "text-slate hover:bg-well hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="col-start-2 row-start-1 justify-self-end text-sm sm:col-start-3">
        {adaption && (
          <span className="rounded-full bg-band px-3 py-1.5 font-semibold text-ok">Explanations built with Adaption</span>
        )}
      </div>
    </header>
  );
}
