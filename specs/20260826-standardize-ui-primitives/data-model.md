# Data Model: Standardize UI Primitives

**Feature**: [Standardize UI Primitives](./spec.md)

**Date**: 2026-08-27

## Primitive standardization boundary

This feature introduces no persistent entity, Prisma model, migration, stored value, API payload,
cookie, or environment variable. The models below describe implementation-time audit records and
ephemeral UI state only. They may be represented by component properties, existing form state,
rendered attributes, and tests; they do not require new runtime types or storage.

## Audit Decision

Represents one confirmed replacement or review candidate from the source issue.

| Field | Type | Rules |
|-------|------|-------|
| `surface` | Stable descriptive key | Required and unique within the audit. |
| `scope` | `main application` \| `email preview` \| `transactional email` | Required. |
| `classification` | `confirmed replacement` \| `review candidate` \| `deferred control group` \| `prohibited scope` | Required. |
| `decision` | `standardize` \| `retain` \| `defer` \| `exclude` | Required. |
| `treatment` | Shared primitive or retained semantic pattern | Required for `standardize` and `retain`. |
| `rationale` | User-experience, semantic, or accessibility reason | Required for `retain`, `defer`, and `exclude`; must be concrete rather than preference-based. |
| `requirements` | One or more specification requirement IDs | Required. |
| `verification` | Automated and/or manual evidence | Required before implementation is complete. |

### Relationships and Validation

- Every source-issue surface maps to exactly one audit decision.
- A shared treatment may serve multiple audit decisions without merging their domain ownership.
- Both email-preview control groups have `scope = email preview` and `decision = defer`.
- Transactional email controls have `decision = exclude`; shared application controls never cross
  that boundary.
- An item cannot be both `standardize` and `retain`; implementation evidence may change the decision
  only if the rationale and verification record change with it.

### Lifecycle

`identified -> researched -> decided -> verified`

No entry is considered verified until its contract checks pass. A failed check returns the entry to
`researched` so the treatment can be corrected or intentionally retained with evidence.

## Form Control Feedback State

Represents the consent checkbox or a sign-in, sign-up, or profile field at a point in time.

| Field | Type | Rules |
|-------|------|-------|
| `controlId` | Existing stable DOM ID | Must continue to identify the same control. |
| `name` | Existing form field name | Must remain compatible with current `FormData` and server validation. |
| `valueState` | Control-specific value; consent uses checked/unchecked | Must not be reset by presentation changes. |
| `required` | Boolean | Preserves the current requirement. |
| `disabled` | Boolean | Mirrors the existing pending or unavailable state. |
| `invalid` | Boolean | True exactly when feedback marks the control invalid. |
| `descriptionIds` | Ordered set of DOM IDs | Contains only IDs that are currently rendered. |
| `error` | Optional localized message and stable ID | When present, renders through `FieldError` with `role="alert"`. |
| `layoutReservation` | Stable non-live container | Maintains the current minimum feedback height whether an error exists or not. |
| `focusTarget` | Underlying native form control | Receives focus when it is the first invalid field. |

### Relationships and Invariants

- A control has one accessible label and zero or more rendered descriptions.
- Consent remains associated with its sibling policy label while Terms and Privacy remain independent
  links.
- When `error` exists, `invalid = true`, the error ID is present in `descriptionIds`, and the error is
  rendered inside `layoutReservation`.
- When `error` is absent, its ID is absent from `descriptionIds` and no empty alert is rendered; the
  layout reservation remains.
- Shared presentation does not replace authoritative server-side validation.

### State Transitions

```text
pristine or valid --invalid submission--> invalid with associated error
invalid --input correction or successful validation--> valid without error
any enabled state --submission starts--> disabled/pending where already enforced
pending --operation settles--> enabled or existing terminal state
```

Focus remains on the current field while an error changes or clears, except when existing submission
logic deliberately focuses the first invalid native control.

## Operation Feedback State

Represents sign-in, sign-up, profile, export, deletion, and session-revocation progress or outcome.

| Field | Type | Rules |
|-------|------|-------|
| `operation` | Existing domain action | Does not change route, authorization, validation, or result. |
| `phase` | `idle` \| `pending` \| `success` \| `error` \| `callback` | Uses existing transitions. |
| `message` | Existing localized text | No new copy unless required to preserve accessibility. |
| `presentation` | `inline` \| `persistent callout` | Chosen by persistence and context, not ARIA role alone. |
| `role` | Existing `alert`, `status`, `note`, or no live role | Preserved for each surface. |
| `livePriority` | Existing `assertive`, `polite`, or none | Preserved. |
| `atomic` | Existing Boolean or omitted state | Preserved. |
| `focusTarget` | Existing optional DOM target | Preserved for callback and dialog flows. |
| `activationGuard` | Existing pending/disabled/idempotency behavior | Prevents repeated activation wherever it does today. |

### State Transitions

```text
idle --activation--> pending
pending --successful result--> success or existing terminal state
pending --failed result--> error
error --retry--> pending
URL callback --page render--> callback
```

The visual wrapper may change, but no transition may create a second live region, duplicate the
message, move focus unexpectedly, or add an interaction step.

## Semantic Action

Represents a visually shared navigation or command control.

| Field | Type | Rules |
|-------|------|-------|
| `kind` | `link` \| `button` | Determined by behavior, never appearance. |
| `destination` | Existing locale-aware URL for links | Required for links and unchanged. |
| `action` | Existing handler for buttons | Required for commands and unchanged. |
| `accessibleName` | Existing localized name | Must remain available without tooltip content. |
| `current` | Optional current-page state | Preserves existing `aria-current` usage. |
| `pending` | Existing Boolean | Retains descriptive pending labels and activation safeguards. |
| `presentation` | `buttonVariants` or `NavigationMenuLink` composition | Must preserve the native element's role. |

A link remains an anchor even when styled as a prominent action. Logout and theme controls remain
native buttons when composed with navigation presentation.

## Security Session Item

Represents one existing item in the ordered active-session list.

| Field | Type | Rules |
|-------|------|-------|
| `position` | Positive integer | Derived from semantic ordered-list position. |
| `isCurrent` | Boolean | Existing current-session determination is unchanged. |
| `currentLabel` | Optional localized text and stable ID | Present exactly when `isCurrent = true`; rendered as `Badge`. |
| `metadata` | Existing session details | Content and sensitivity are unchanged. |
| `boundary` | Presentational CSS border | Never represented as an additional list item. |

When `isCurrent = true`, the owning list item retains `aria-current` and references or includes the
visible non-color status cue. Badge presentation does not change item order, metadata, or revocation
behavior.

## Content Boundary and Callout

Two independent presentation records prevent borders and notices from being standardized solely by
visual similarity.

### Content Boundary

- `betweenSections`: use the existing `Separator` as a sibling between account-page sections.
- `withinOrderedList`: retain presentational borders; do not insert separator list entries.
- Headings, landmarks, sections, and reading order remain unchanged.

### Callout

- `persistent = true`: legal draft notices, the sensitive personal-data warning, and standalone
  account data/security callbacks may use `Alert` and `AlertDescription`.
- `persistent = false`: field feedback and transient form/dialog statuses remain inline.
- Existing message text, role, live priority, atomicity, focus target, and announcement timing are
  required attributes of the composed result.

## Migration and Recovery

There is no data migration. Recovery is source-level rollback of the compatible UI composition and
test changes; no database restore, record conversion, cache invalidation, or deployment transition is
required.