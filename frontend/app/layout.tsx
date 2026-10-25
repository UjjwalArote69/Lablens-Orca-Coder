import type { Metadata } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LabLens: understand your lab report",
  description:
    "LabLens flags lab results outside the reference range and points out combinations worth discussing with a doctor.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${atkinson.variable} antialiased`}>
      <body className="min-h-screen bg-paper text-ink">
        <Header />
        <main className="mx-auto w-full max-w-[980px] px-5 pt-12 pb-20 sm:px-8 sm:pt-16">{children}</main>
      </body>
    </html>
  );
}
