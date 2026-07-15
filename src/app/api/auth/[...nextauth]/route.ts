import type { NextRequest } from "next/server";
import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";
import { getRequestLogger } from "@/lib/logger";
import { getClientIdentifier } from "@/lib/request-context";
import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";

// Auth.js route handler — serves sign-in, callback, session and CSRF endpoints
// under /api/auth/* for the App Router.
const authHandler = NextAuth(authOptions);
type AuthRouteContext = {
	params: Promise<{ nextauth: string[] }>;
};

export const GET = authHandler;

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;

async function getEmailLimitKey(request: NextRequest): Promise<string | null> {
	const formData = await request.clone().formData().catch(() => null);
	const email = formData?.get("email");
	if (typeof email !== "string" || email.trim() === "") return null;

	const bytes = new TextEncoder().encode(email.trim().toLowerCase());
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export async function POST(request: NextRequest, context: AuthRouteContext) {
	const pathname = new URL(request.url).pathname;
	if (!pathname.endsWith("/signin/email")) {
		return authHandler(request, context);
	}

	const emailKey = await getEmailLimitKey(request);
	const clientResult = await consumeSharedRateLimit({
		key: `auth:email:client:${getClientIdentifier(request)}`,
		limit: 5,
		windowMs: RATE_LIMIT_WINDOW_MS,
	});
	if (!clientResult.allowed) {
		return rateLimitResponse(request, pathname, clientResult.retryAfterSeconds);
	}

	const emailResult = emailKey
		? await consumeSharedRateLimit({
				key: `auth:email:address:${emailKey}`,
				limit: 3,
				windowMs: RATE_LIMIT_WINDOW_MS,
			})
		: null;
	if (emailResult && !emailResult.allowed) {
		return rateLimitResponse(request, pathname, emailResult.retryAfterSeconds);
	}

	return authHandler(request, context);
}

function rateLimitResponse(
	request: NextRequest,
	pathname: string,
	retryAfterSeconds: number,
) {
	getRequestLogger(request, { route: pathname }).warn(
		{ retryAfterSeconds },
		"email sign-in rate limit exceeded",
	);
	return Response.json(
		{ error: "Too many sign-in attempts. Try again later." },
		{
			status: 429,
			headers: {
				"Retry-After": String(retryAfterSeconds),
				"X-RateLimit-Remaining": "0",
			},
		},
	);
}
