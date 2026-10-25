"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";

export default function Header() {
  const pathname = usePathname();
  const [adaption, setAdaption] = useState(false);

  useEffect(() => {
    getHealth()
      .then((h) => setAdaption(h.explanations_source === "adaption"))
      .catch(() => {});
  }, []);

  const onHow = pathname === "/how-it-works";
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[980px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-8">
        <Link href="/" className="text-lg font-bold tracking-tight">
          LabLens
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {adaption && <span className="text-muted">Explanations built with Adaption</span>}
          <Link
            href="/how-it-works"
            aria-current={onHow ? "page" : undefined}
            className={onHow ? "font-bold" : "text-muted transition-colors hover:text-ink"}
          >
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
