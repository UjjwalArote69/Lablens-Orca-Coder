"use client";

import { ScanSearch, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";

const NAV = [
  { href: "/", label: "Check a report" },
  { href: "/how-it-works", label: "How it works" },
];

export default function Header() {
  const pathname = usePathname();
  const [adaption, setAdaption] = useState(false);

  useEffect(() => {
    getHealth()
      .then((h) => setAdaption(h.explanations_source === "adaption"))
      .catch(() => {});
  }, []);

  return (
    <header className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[22px] bg-surface px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-5">
      <Link
        href="/"
        className="col-start-1 row-start-1 flex items-center gap-2.5 justify-self-start text-lg font-semibold tracking-tight"
      >
        <span className="flex size-9 items-center justify-center rounded-[12px] bg-linear-to-br from-[#5b95f8] to-[#2560e6] text-white">
          <ScanSearch className="size-5" aria-hidden="true" />
        </span>
        LabLens
      </Link>

      <nav
        aria-label="Main"
        className="col-span-2 col-start-1 row-start-2 flex justify-center gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1"
      >
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                active
                  ? "bg-linear-to-b from-[#4c8df6] to-[#2563eb] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(37,99,235,0.7)]"
                  : "bg-subtle font-medium text-ink hover:bg-[#ebeff6]"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
        {adaption && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d6e0f5] bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Explanations built with Adaption
          </span>
        )}
      </div>
    </header>
  );
}
