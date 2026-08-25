import { getEnv } from "@/lib/env";

export function register(): void {
  try {
    getEnv();
  } catch (error) {
    if (
      process.env.NEXT_RUNTIME === "nodejs" &&
      process.env.NODE_ENV === "production"
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Invalid environment configuration";

      process.stderr.write(`${message}\n`);
      process.exit(1);
    }

    throw error;
  }
}