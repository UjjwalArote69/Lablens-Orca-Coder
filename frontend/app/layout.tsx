import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LabLens: understand your lab report",
  description:
    "LabLens flags lab results outside the reference range and points out combinations worth discussing with a doctor.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen bg-canvas text-ink">
        <div className="mx-auto w-full max-w-[1320px] sm:px-5 sm:py-6">
          <div className="min-h-screen bg-frame px-3 py-3 sm:min-h-0 sm:rounded-[32px] sm:px-6 sm:py-6">
            <Header />
            <main className="pt-6 pb-8 sm:pt-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
