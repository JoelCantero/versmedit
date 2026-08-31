import { NextRequest } from "next/server";
import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";
import { validateAuthCsrfToken } from "@/lib/auth-csrf";
import { getAuthEmailAddressRateLimitKey } from "@/lib/auth-email-rate-limit";
import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import { getProviderAvailability } from "@/lib/provider-availability";
import { getClientIdentifier } from "@/lib/request-context";
import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";
import { getAccountDeletionVerificationAuthorization } from "@/modules/account/deletion/verification-context";
import { parseLoginEmail } from "@/modules/login/schema";
import {
	findExistingLoginEmail,
	waitForAcceptedLogin,
} from "@/modules/login/service";
import { runWithVerificationContext } from "@/modules/login/verification-context";
import { getSignupActivationAuthorization } from "@/modules/signup/verification-context";

type AuthRouteContext = {
	params: Promise<{ nextauth: string[] }>;
};

async function authHandler(request: NextRequest, context: AuthRouteContext) {
	return await NextAuth(request, context, authOptions);
}

async function rejectUnauthorizedInternalProvider(
	request: NextRequest,
	context: AuthRouteContext,
) {
	const { nextauth = [] } = await context.params;
	if (nextauth[1] === "signup") {
		if (nextauth[0] === "callback" && getSignupActivationAuthorization()) {
			return null;
		}
		return Response.redirect(
			new URL("/signup?state=invalid_link", request.url),
			302,
		);
	}
	if (nextauth[1] === "account-deletion") {
		if (
			nextauth[0] === "callback" &&
			getAccountDeletionVerificationAuthorization()
		) {
			return null;
		}
		return Response.redirect(
			new URL("/account/data?state=invalid_link", request.url),
			302,
		);
	}
	return null;
}

export async function GET(request: NextRequest, context: AuthRouteContext) {
	const rejection = await rejectUnauthorizedInternalProvider(request, context);
	if (rejection) return rejection;
	return await authHandler(request, context);
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;

export async function POST(request: NextRequest, context: AuthRouteContext) {
	const rejection = await rejectUnauthorizedInternalProvider(request, context);
	if (rejection) return rejection;
	const pathname = new URL(request.url).pathname;
	if (!pathname.endsWith("/signin/email")) {
		return await authHandler(request, context);
	}
	const mail = getEnv().MAIL;
	if (!mail.enabled) {
		return Response.json({ status: "unavailable" }, { status: 503 });
	}

	const startedAt = Date.now();
	const clientResult = await consumeSharedRateLimit({
		key: `auth:email:client:${getClientIdentifier(request)}`,
		limit: 5,
		windowMs: RATE_LIMIT_WINDOW_MS,
	});
	if (!clientResult.allowed) {
		return rateLimitResponse(request, pathname, clientResult.retryAfterSeconds);
	}

	const formData = await request.clone().formData().catch(() => null);
	const csrfToken = formData?.get("csrfToken");
	if (
		!validateAuthCsrfToken({
			bodyToken: typeof csrfToken === "string" ? csrfToken : undefined,
			cookieHeader: request.headers.get("cookie") ?? undefined,
			secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
		})
	) {
		return Response.json({ status: "invalid_request" }, { status: 403 });
	}

	let normalizedEmail: string;
	try {
		normalizedEmail = parseLoginEmail(formData?.get("email"));
	} catch {
		return Response.json({ status: "invalid", field: "email" }, { status: 400 });
	}

	const emailResult = await consumeSharedRateLimit({
		key: getAuthEmailAddressRateLimitKey(normalizedEmail),
		limit: 3,
		windowMs: RATE_LIMIT_WINDOW_MS,
	});
	if (!emailResult.allowed) {
		return rateLimitResponse(request, pathname, emailResult.retryAfterSeconds);
	}

	const providerAvailability = await getProviderAvailability(mail);
	if (!providerAvailability.available) {
		getRequestLogger(request, { route: pathname }).warn(
			{ retryAfterSeconds: providerAvailability.retryAfterSeconds },
			"email provider temporarily unavailable",
		);
		return Response.json(
			{ status: "unavailable" },
			{
				status: 503,
				headers: {
					"Retry-After": String(providerAvailability.retryAfterSeconds),
				},
			},
		);
	}

	const existingEmail = await findExistingLoginEmail(normalizedEmail);
	if (!existingEmail) {
		await waitForAcceptedLogin({ startedAt });
		return Response.json({ status: "accepted" });
	}

	formData?.set("email", existingEmail);
	const delegatedBody = new URLSearchParams();
	for (const [key, value] of formData?.entries() ?? []) {
		if (typeof value === "string") delegatedBody.append(key, value);
	}
	const headers = new Headers(request.headers);
	headers.delete("content-length");
	await runWithVerificationContext(async () => {
		try {
			await authHandler(
				new NextRequest(request.url, {
					method: "POST",
					headers,
					body: delegatedBody,
				}),
				context,
			);
		} catch {
			// Delivery failures are compensated inside the provider and remain private.
		}
	});
	await waitForAcceptedLogin({ startedAt });
	return Response.json({ status: "accepted" });
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
		{ status: "rate_limited", retryAfter: retryAfterSeconds },
		{
			status: 429,
			headers: {
				"Retry-After": String(retryAfterSeconds),
				"X-RateLimit-Remaining": "0",
			},
		},
	);
}
