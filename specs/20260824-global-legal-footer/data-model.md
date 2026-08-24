# Phase 1 Data Model: Global Legal Footer

## Persistence Assessment

This feature introduces no persistent domain entity, database table, cookie, local-storage value,
session field, cache entry, or analytics record. No Prisma schema or migration change is required.

The only model is an immutable presentation definition resolved into localized links at render time.

## Footer Destination Definition

Represents one globally available legal destination before localization.

| Field | Type | Rules |
|-------|------|-------|
| `id` | `terms` or `privacy` | Stable, unique identifier within the footer collection |
| `path` | Canonical application path | Sourced from `POLICY_PATHS`; `/terms` or `/privacy` only |
| `labelKey` | Existing policy title message key | `Policies.terms.title` or `Policies.privacy.title` |
| `position` | Integer | Unique and fixed: Terms is `1`, Privacy is `2` |

### Collection Invariants

- The initial collection contains exactly two entries.
- Entry identifiers, paths, label keys, and positions are unique.
- Terms precedes Privacy in rendered and keyboard order.
- The collection is independent of route and authentication state.
- Rendering maps the collection once; route pages do not own or copy entries.

## Localized Footer View

Derived at request render time from one supported locale and the destination definitions. It is
never stored.

| Field | Type | Derivation and validation |
|-------|------|---------------------------|
| `locale` | `en`, `es`, or `ca` | Already validated by the localized layout against `routing.locales` |
| `navigationLabel` | Non-empty localized string | Read from `Footer.navigationLabel` for the active locale |
| `links` | Ordered pair of localized legal links | Derived from destination definitions in ascending `position` order |

Each localized link contains:

| Field | Type | Derivation and validation |
|-------|------|---------------------------|
| `id` | `terms` or `privacy` | Copied from its destination definition |
| `visibleLabel` | Non-empty localized string | Resolved from the definition's policy title message key |
| `canonicalPath` | `/terms` or `/privacy` | Copied from `POLICY_PATHS` |
| `renderedHref` | Localized application path | Produced by the locale-aware Link using the matrix below |

### Locale Resolution Matrix

| Locale | Terms href | Privacy href |
|--------|------------|--------------|
| `en` | `/terms` | `/privacy` |
| `es` | `/es/terms` | `/es/privacy` |
| `ca` | `/ca/terms` | `/ca/privacy` |

### View Invariants

- The navigation label and both visible labels come from the same active locale with no fallback
  language visible to the user.
- The two rendered hrefs preserve the active locale according to `localePrefix: "as-needed"`.
- The same view is rendered for signed-in and signed-out users.
- The view contains no user identifier, session value, policy acceptance, policy version, or route-
  specific action.

## Relationships

```text
Supported locale
      |
      v
Localized Footer View 1 ---- 2 Localized Legal Links
                                      |
                                      v
                           Footer Destination Definitions
                                      |
                                      v
                         Existing canonical policy pages
```

## State Transitions

There is no feature-owned lifecycle or mutable state. A locale change causes the next render to
derive a different localized view from the same immutable destination definitions. Authentication
changes do not alter the model.

## Migration and Recovery

- **Forward migration**: N/A.
- **Compatibility window**: N/A; existing routes and policy content remain unchanged.
- **Corrective migration**: N/A.
- **Backup/restore impact**: None.
- **Rollback**: Revert the application component, layout composition, catalog key, and tests; no
  stored data needs reversal.