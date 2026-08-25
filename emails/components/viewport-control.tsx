"use client";

import { Monitor, Smartphone } from "lucide-react";

export type PreviewViewport = "desktop" | "mobile";

interface ViewportControlProps {
  value: PreviewViewport;
  onChange: (value: PreviewViewport) => void;
}

export function ViewportControl({ value, onChange }: ViewportControlProps) {
  return (
    <div className="segment-control" role="group" aria-label="Preview width">
      <button
        type="button"
        className="segment-button"
        aria-label="Desktop width"
        aria-pressed={value === "desktop"}
        title="Desktop width"
        onClick={() => onChange("desktop")}
      >
        <Monitor aria-hidden="true" size={16} strokeWidth={1.8} />
        <span>Desktop</span>
      </button>
      <button
        type="button"
        className="segment-button"
        aria-label="Mobile width"
        aria-pressed={value === "mobile"}
        title="Mobile width"
        onClick={() => onChange("mobile")}
      >
        <Smartphone aria-hidden="true" size={16} strokeWidth={1.8} />
        <span>Mobile</span>
      </button>
    </div>
  );
}