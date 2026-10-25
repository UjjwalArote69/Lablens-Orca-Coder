import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

// Designed by the Braille Institute for low-vision readers: patients of every age read this page.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: false, // Next has no metrics for this family yet
});

export const metadata: Metadata = {
  title: "LabLens: understand your lab report",
  description:
    "LabLens flags lab results outside the reference range and points out combinations worth discussing with a doctor.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${atkinson.variable} antialiased`}>
      <body className="min-h-screen text-ink">
        <div className="mx-auto w-full max-w-[1280px] sm:px-5 sm:py-6">
          <div className="min-h-screen px-3 py-3 sm:min-h-0 sm:px-7 sm:py-7">
            <Header />
            <main className="pt-8 pb-6 sm:pt-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
