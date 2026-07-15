import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getRequestLogger } from "@/lib/logger";

// Health/readiness probe used by Docker healthchecks (constitution Principle VIII).
// Verifies process liveness AND PostgreSQL connectivity, so an app that cannot
// reach its database is reported unhealthy.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const log = getRequestLogger(request, { route: "/api/health" });

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (err) {
    // Log server-side for diagnostics; never leak connection details or stack
    // traces to the client (constitution Principle X).
    log.error({ err }, "health check failed: database unreachable");
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: "ok",
    database: "ok",
    timestamp: new Date().toISOString(),
  });
}
