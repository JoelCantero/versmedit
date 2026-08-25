import Link from "next/link";

import { renderEmailPresentation } from "../../src/lib/email/presentation";
import { previewManifest } from "../lib/preview-manifest";

const localeNames = {
  en: "English",
  es: "Español",
  ca: "Català",
} as const;

export default async function CataloguePage() {
  const proofs = await Promise.all(
    previewManifest.map(async (entry) => ({
      ...entry,
      subject: (await renderEmailPresentation(entry.request)).subject,
    })),
  );

  return (
    <main className="catalogue-shell">
      <section className="catalogue-intro">
        <div>
          <p className="eyebrow">Transactional mail / proof set</p>
          <h1>Email proofs</h1>
        </div>
        <dl className="proof-summary">
          <div>
            <dt>Variants</dt>
            <dd>12</dd>
          </div>
          <div>
            <dt>Locales</dt>
            <dd>03</dd>
          </div>
          <div className="proof-total">
            <dt>Proofs</dt>
            <dd>36</dd>
          </div>
        </dl>
      </section>

      {Object.entries(localeNames).map(([locale, localeName], localeIndex) => {
        const localeProofs = proofs.filter((proof) => proof.locale === locale);

        return (
          <section className="locale-section" key={locale}>
            <header className="locale-header">
              <span className="locale-number">0{localeIndex + 1}</span>
              <h2>{localeName}</h2>
              <span className="locale-code">{locale.toUpperCase()}</span>
              <span className="locale-count">12 proofs</span>
            </header>
            <div className="proof-grid">
              {localeProofs.map((proof, proofIndex) => (
                <Link
                  className="proof-link"
                  data-testid="preview-link"
                  href={proof.path}
                  key={proof.key}
                >
                  <span className="proof-order">
                    {String(proofIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="proof-copy">
                    <strong>{proof.subject}</strong>
                    <code>{proof.variant}</code>
                  </span>
                  <span
                    className="proof-classification"
                    data-classification={proof.classification}
                  >
                    {proof.classification === "operational" ? "Live" : "Future"}
                  </span>
                  <span className="proof-arrow" aria-hidden="true">
                    ↗
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}