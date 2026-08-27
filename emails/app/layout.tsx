import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { PREVIEW_BRAND } from "../lib/preview-fixtures";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `Email proofs | ${PREVIEW_BRAND.productName}`,
    template: `%s | ${PREVIEW_BRAND.productName} email proofs`,
  },
  description: "Local transactional email proofing catalogue.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.className} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link className="wordmark" href="/">
              {PREVIEW_BRAND.productName}
            </Link>
            <span className="header-rule" aria-hidden="true" />
            <span className="header-title">Email proofs</span>
            <span className="header-index">36 / local</span>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <span>{PREVIEW_BRAND.productName} proofing desk</span>
          <span>12 variants · 3 locales</span>
        </footer>
      </body>
    </html>
  );
}