"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";

export default function Header() {
  const [adaption, setAdaption] = useState(false);

  useEffect(() => {
    getHealth()
      .then((h) => setAdaption(h.explanations_source === "adaption"))
      .catch(() => {});
  }, []);

  return (
    <header className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
      <Link href="/" className="text-2xl font-bold tracking-tight">
        LabLens
      </Link>
      <nav className="flex flex-wrap items-center justify-end gap-3 text-sm">
        <Link href="/how-it-works" className="font-bold underline-offset-4 hover:underline">
          How it works
        </Link>
        {adaption && (
          <span className="rounded-full border border-band-edge bg-band px-3 py-1 text-ok">
            Explanations built with Adaption
          </span>
        )}
      </nav>
    </header>
  );
}
