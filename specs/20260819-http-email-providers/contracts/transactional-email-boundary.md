# Contract: Transactional Email Boundary

## Ownership

`src/lib/email/` is the only server-side provider boundary. Auth.js, signup, activation, notice, locale, and account-lifecycle code depend on this contract and contain no Brevo or Mailjet decisions.

## Conceptual Interface

```ts
type EmailProviderName = "brevo" | "mailjet";

type EmailSendCategory =
  | "accepted"
  | "authentication"
  | "rate_limited"
  | "recipient_rejected"
  | "provider_unavailable"
  | "invalid_request"
  | "unknown";

interface TransactionalEmail {
  recipient: string;
  locale: "en" | "es" | "ca";
  subject: string;
  text: string;
  html: string;
}

interface NormalizedSendResult {
  accepted: boolean;
  providerMessageId: string | null;
  provider: EmailProviderName;
  category: EmailSendCategory;
}

interface TransactionalEmailProvider {
  readonly provider: EmailProviderName;
  send(message: TransactionalEmail): Promise<NormalizedSendResult>;
}
```

The production factory binds validated sender data, credentials, constants, logger, clock, and native fetch. Tests may inject an internal request function into a provider constructor/factory. The public send input has no URL, credential, sender, provider, retry, tracking, or attachment field.

## Preconditions

- Startup configuration is valid and `MAIL_ENABLED` is true.
- The current public request captured an available provider-health snapshot before any account lookup or mutation.
- The caller supplies one validated recipient and non-empty localized subject, text, and HTML.
- Sender email and sender name come only from normalized configuration.

When mail is disabled or the health snapshot is unavailable, the public route stops before constructing a message or invoking this contract. There is no `disabled` send category.

## Result Invariants

- The result has exactly `accepted`, `providerMessageId`, `provider`, and `category`.
- `accepted` is true if and only if `category` is `accepted`.
- `providerMessageId` is nullable and never invented.
- Provider bodies, status text, headers, URLs, retry metadata, and exceptions do not cross the boundary.
- Every network/provider failure is converted to a normalized result. Only programmer/configuration invariant failures before the outbound attempt may raise a redacted internal error.
- Acceptance means the provider accepted the submission. It never means delivered.

## Attempt Contract

For one `send` invocation:

1. Validate and map the common message.
2. Create exactly one request for the selected provider.
3. Apply the 2,500 ms total timeout and 64 KiB response limit.
4. Do not follow redirects.
5. Validate the provider-specific response.
6. Return one terminal normalized result.
7. Emit one allowlisted outbound event.

There is no retry, fallback, failover, SMTP call, background continuation, queue insertion, or second provider request. A new user/domain request is the only recovery path.

## Caller Rules

### Magic-link login

- Unknown email: preserve the existing accepted public response and create no user, account, email, profile, or token; do not send.
- Known active email: issue according to current Auth.js rules, then send once.
- Any non-accepted result: immediately invalidate the newly issued token; superseded tokens remain invalid.
- Provider outcome never changes the account-private public response or response floor.

### Signup onboarding and activation

- New or reusable pending account: preserve current atomic pending-account/token rules and send once.
- Any non-accepted result: invalidate the new onboarding token, retain the reusable pending inactive account, and never restore a superseded token.
- Public response remains the current generic accepted signup result for isolated send outcomes.

### Existing-account notice

- Send the credential-free localized notice once.
- A non-accepted result creates no credential, mutation, or session and does not change the generic public result.

## Extension Rule

A future provider implements the same adapter interface, fixed endpoint ownership, result schema, timeout/body limits, one-attempt rule, and redaction policy. Business-flow call sites and public contracts do not change.

## Logging Contract

Allowed fields: provider, normalized category, acceptance flag, safe provider message identifier, safe status class, duration, and non-personal request correlation.

Forbidden fields: credentials, authentication headers, endpoint URLs, recipient, recipient name, account/user/profile/email IDs, tokens, authentication links, locale content, subject, text, HTML, request payload, raw response, and provider error message.
