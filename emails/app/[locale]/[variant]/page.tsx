import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { renderEmailPresentation } from "../../../../src/lib/email/presentation";
import { PreviewInspector } from "../../../components/preview-inspector";
import {
  findPreviewEntry,
  previewManifest,
} from "../../../lib/preview-manifest";

interface DetailPageProps {
  params: Promise<{ locale: string; variant: string }>;
}

const renderPreviewEmail = cache(renderEmailPresentation);

export const dynamicParams = false;

export function generateStaticParams() {
  return previewManifest.map(({ locale, variant }) => ({ locale, variant }));
}

export async function generateMetadata({
  params,
}: DetailPageProps): Promise<Metadata> {
  const { locale, variant } = await params;
  const entry = findPreviewEntry(locale, variant);
  if (!entry) return { title: "Proof not found" };

  const rendered = await renderPreviewEmail(entry.request);
  return { title: rendered.subject };
}

export default async function PreviewDetailPage({ params }: DetailPageProps) {
  const { locale, variant } = await params;
  const entry = findPreviewEntry(locale, variant);
  if (!entry) notFound();

  const rendered = await renderPreviewEmail(entry.request);
  const proofNumber = previewManifest.findIndex(({ key }) => key === entry.key) + 1;
  const localeEntries = previewManifest.filter(
    (candidate) => candidate.variant === entry.variant,
  );

  return (
    <main className="detail-shell">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Catalogue</Link>
        <span aria-hidden="true">/</span>
        <span>{entry.locale.toUpperCase()}</span>
        <span aria-hidden="true">/</span>
        <span>{String(proofNumber).padStart(2, "0")}</span>
      </nav>

      <header className="detail-header">
        <div className="detail-heading">
          <p className="eyebrow">{entry.variant}</p>
          <h1>{rendered.subject}</h1>
        </div>
        <div className="detail-meta">
          <span data-classification={entry.classification}>
            {entry.classification === "operational" ? "Operational" : "Future"}
          </span>
          <span>Proof {String(proofNumber).padStart(2, "0")} / 36</span>
        </div>
        <nav className="locale-switcher" aria-label="Language">
          {localeEntries.map((candidate) => (
            <Link
              aria-current={candidate.locale === entry.locale ? "page" : undefined}
              href={candidate.path}
              key={candidate.locale}
            >
              {candidate.locale.toUpperCase()}
            </Link>
          ))}
        </nav>
      </header>

      <Suspense fallback={null}>
        <PreviewInspector html={rendered.html} text={rendered.text} />
      </Suspense>
    </main>
  );
}