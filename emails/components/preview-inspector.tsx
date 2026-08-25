"use client";

import { AlignLeft, Code2, PanelsTopLeft } from "lucide-react";
import { useState } from "react";

import {
  ViewportControl,
  type PreviewViewport,
} from "./viewport-control";

type InspectionMode = "display" | "source" | "text";

interface PreviewInspectorProps {
  html: string;
  text: string;
}

export function PreviewInspector({ html, text }: PreviewInspectorProps) {
  const [mode, setMode] = useState<InspectionMode>("display");
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");

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
            onClick={() => setMode("display")}
          >
            <PanelsTopLeft aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>Display</span>
          </button>
          <button
            type="button"
            className="segment-button"
            aria-pressed={mode === "source"}
            onClick={() => setMode("source")}
          >
            <Code2 aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>HTML source</span>
          </button>
          <button
            type="button"
            className="segment-button"
            aria-pressed={mode === "text"}
            onClick={() => setMode("text")}
          >
            <AlignLeft aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>Plain text</span>
          </button>
        </div>

        {mode === "display" ? (
          <ViewportControl value={viewport} onChange={setViewport} />
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