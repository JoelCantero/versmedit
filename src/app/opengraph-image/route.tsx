import { ImageResponse } from "next/og";

import { getEnv } from "@/lib/env";

const imageSize = { width: 1200, height: 630 };

export function GET() {
  const { BRAND } = getEnv();

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: BRAND.primaryColor,
        color: BRAND.actionForeground,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "80px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          border: `4px solid ${BRAND.actionForeground}`,
          display: "flex",
          fontSize: 72,
          fontWeight: 700,
          justifyContent: "center",
          minHeight: 300,
          padding: "64px 80px",
          textAlign: "center",
          width: "100%",
        }}
      >
        {BRAND.productName}
      </div>
    </div>,
    imageSize,
  );
}