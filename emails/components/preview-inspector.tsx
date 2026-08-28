"use client";

import { AlignLeft, Code2, PanelsTopLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ViewportControl,
  type PreviewViewport,
} from "./viewport-control";

type InspectionMode = "display" | "source" | "text";

interface PreviewInspectorProps {
  html: string;
  text: string;
}

function parseMode(value: string | null): InspectionMode {
  return value === "source" || value === "text" ? value : "display";
}

function parseViewport(value: string | null): PreviewViewport {
  return value === "mobile" ? value : "desktop";
}

export function PreviewInspector({ html, text }: PreviewInspectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get("mode"));
  const viewport = parseViewport(searchParams.get("viewport"));

  function updatePreview(
    nextMode: InspectionMode,
    nextViewport: PreviewViewport = viewport,
  ) {
    const params = new URLSearchParams(searchParams);

    if (nextMode === "display") params.delete("mode");
    else params.set("mode", nextMode);

    if (nextViewport === "desktop") params.delete("viewport");
    else params.set("viewport", nextViewport);

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <section className="inspector" aria-label="Email inspector">
      <div className="inspector-toolbar">
        <div
          className="segment-control"
          role="group"
          aria-label="Inspection mode"
        >
          <button
            type="button"
            className="segment-button"
            aria-pressed={mode === "display"}
            onClick={() => updatePreview("display")}
          >
            <PanelsTopLeft aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>Display</span>
          </button>
          <button
            type="button"
            className="segment-button"
            aria-pressed={mode === "source"}
            onClick={() => updatePreview("source")}
          >
            <Code2 aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>HTML source</span>
          </button>
          <button
            type="button"
            className="segment-button"
            aria-pressed={mode === "text"}
            onClick={() => updatePreview("text")}
          >
            <AlignLeft aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>Plain text</span>
          </button>
        </div>

        {mode === "display" ? (
          <ViewportControl
            value={viewport}
            onChange={(nextViewport) => updatePreview(mode, nextViewport)}
          />
        ) : null}
      </div>

      <div className="inspector-stage" data-mode={mode}>
        {mode === "display" ? (
          <div
            className="preview-viewport"
            data-testid="preview-viewport"
            data-viewport={viewport}
          >
            <iframe
              className="email-frame"
              title="Rendered email"
              srcDoc={html}
              sandbox=""
              referrerPolicy="no-referrer"
            />
          </div>
        ) : null}
        {mode === "source" ? (
          <pre className="code-proof" data-testid="html-source">
            <code>{html}</code>
          </pre>
        ) : null}
        {mode === "text" ? (
          <pre className="text-proof" data-testid="plain-text">
            {text}
          </pre>
        ) : null}
      </div>
    </section>
  );
}