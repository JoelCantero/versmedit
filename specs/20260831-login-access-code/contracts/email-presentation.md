# Contract: `loginMagicLink` email presentation

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

The login email gains the access code. The presentation layer validates request keys and copy keys
exactly, so the change is expressed through the variant definition rather than as an ad-hoc field.

## Variant definition change

`EMAIL_VARIANT_DEFINITIONS.loginMagicLink` in `src/lib/email/presentation/constants.ts`:

```diff
 loginMagicLink: {
   classification: "operational",
   actionMode: "credential",
-  valueKeys: ["actionUrl"],
+  valueKeys: ["actionUrl", "verificationCode"],
 },
```

`EmailVariantValues.loginMagicLink` in `src/lib/email/presentation/types.ts` gains
`readonly verificationCode: string`. No other variant is touched.

## Request contract

```ts
renderEmailPresentation({
  variant: "loginMagicLink",
  locale: "es",
  brand,
  actionUrl: "https://example.test/api/auth/callback/email?token=...",
  verificationCode: "7K2QM9XPTR",
});
```

`verificationCode` validation, added alongside the existing `actionUrl`, `newEmail`, `occurredAt` and
`reference` branches in `validateEmailPresentationRequest`:

- must be a `string`, already trimmed;
- must be exactly 10 characters;
- every character must be in `0123456789ABCDEFGHJKMNPQRSTVWXYZ`.

Anything else raises `EmailPresentationError("INVALID_INPUT", "verificationCode")`.

Because `resolveCopy` adds non-`actionUrl` string value keys to the placeholder map,
`{verificationCode}` becomes available to catalog copy. It is deliberately **not** used in any string:
the code is rendered as a distinct block so it stays legible and easy to select.

## Rendering

`EmailDocument` gains an optional `code` prop, rendered inside the action section beneath the
fallback instruction:

- monospace font, large size, generous letter spacing, high contrast against a light panel;
- `user-select: all` so a single click selects the whole code;
- present in both bodies — the plain-text render is produced from the same document, so no separate
  text template is needed.

Existing renderer guards continue to apply unchanged: no leftover `{...}` placeholders, no literal
`undefined`, no `<script>`, non-empty HTML and text.

## Copy changes

Only the `Email.loginMagicLink` block changes, in all three catalogs. The key set is unchanged, so the
shared copy validator is untouched.

| Key | English reference |
|-----|-------------------|
| `subject` | `Your login code for {productName}` |
| `heading` | `Your login code for {productName}` |
| `actionLabel` | `Log in to {productName}` |
| `fallbackInstruction` | `This link and code will only be valid for the next 5 minutes. If the link does not work, you can use the login verification code directly:` |
| `paragraphs` | Must no longer state 15 minutes |

Spanish: `Tu código de acceso a {productName}`, `Iniciar sesión en {productName}`, `Este enlace y
código solo serán válidos durante los próximos 5 minutos. Si el enlace no funciona, puedes usar
directamente este código de verificación:`

Catalan: `El teu codi d'accés a {productName}`, `Inicia sessió a {productName}`, `Aquest enllaç i codi
només seran vàlids durant els pròxims 5 minuts. Si l'enllaç no funciona, pots utilitzar directament
aquest codi de verificació:`

The stated 5 minutes must equal the enforced `maxAge` of the `email` provider. The preview fixtures in
`emails/lib/preview-fixtures.ts` must supply a `verificationCode` for the `loginMagicLink` variant so
the preview app keeps building.
