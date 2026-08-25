import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Email proofs | Versmedit",
    template: "%s | Versmedit email proofs",
  },
  description: "Local transactional email proofing catalogue.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link className="wordmark" href="/">
              Versmedit
            </Link>
            <span className="header-rule" aria-hidden="true" />
            <span className="header-title">Email proofs</span>
            <span className="header-index">36 / local</span>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <span>Versmedit proofing desk</span>
          <span>12 variants · 3 locales</span>
        </footer>
      </body>
    </html>
  );
}