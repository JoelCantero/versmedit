# Contract: Personal Data Export Contributors

## Purpose and Ownership

The contributor boundary lets framework and product modules add account-attributable personal data
without teaching the export orchestrator about domain tables. Framework core owns types, registry
validation, orchestration, canonical serialization, limits, and failure semantics. Each data-owning
module owns its declaration, query, projection, classifications, ordering, schema version, and
tests. The application composition root owns the complete namespace inventory and contributor list.

The core imports no product module. Registration is immutable and explicit at application startup;
there is no import-order global registry and no database/source-directory discovery.

## Conceptual Type Contract

The implementation may refine names, but it must preserve this shape and direction:

```ts
type PersonalDataClassification = "user_provided" | "observed" | "derived";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface PersonalDataModuleDeclaration {
  namespace: string;
  schemaVersion: number;
  classifications: readonly PersonalDataClassification[];
  unavailableReasons: readonly string[];
}

interface PersonalDataExportReadContext {
  userId: string;
  currentSessionId: string;
  generatedAt: Date;
  transaction: Prisma.TransactionClient;
  signal: AbortSignal;
}

type PersonalDataContribution =
  | { status: "included"; data: JsonValue }
  | { status: "unavailable"; reason: string };

interface PersonalDataExportContributor {
  readonly namespace: string;
  readonly schemaVersion: number;
  contribute(
    context: PersonalDataExportReadContext,
  ): Promise<PersonalDataContribution>;
}
```

`userId`, `currentSessionId`, and `transaction` are server-only selectors and never become export
values automatically. The orchestrator validates output before copying it into the envelope.

## Namespace Contract

- Namespace syntax is `^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$`, maximum 128 characters.
- Framework version 1 reserves `account`, `policyAcceptances`, and `activeSessions`.
- Product modules should use a stable product/domain prefix for potentially colliding names, such as
  `journal.entries`.
- Comparison and ordering use Unicode code-point lexical order over validated namespace strings.
- Namespace changes are breaking section identity changes; add a new namespace rather than silently
  renaming one.
- Registry construction rejects duplicate declarations, duplicate contributors, undeclared
  contributors, and declarations without one matching contributor.

## Composition Contract

The composition root supplies two immutable inputs:

1. the full declared inventory of modules known to store account-attributable personal data;
2. one contributor for each declared namespace.

The registry constructor validates one-to-one equality before generation. A derived application
must add a data-owning module to the inventory in the same change that introduces its personal-data
storage. Its contract test intentionally builds the registry once without that contributor and
expects a missing-contributor failure, then builds the complete registry successfully. This makes
omission behavior visible without automatic table discovery.

Framework core receives only the validated, namespace-sorted registry. Routes inject it into the
orchestrator. The orchestrator and built-in contributors do not import fixture/product modules.

## Read Context Contract

- Every contributor receives the same exact `userId`, `currentSessionId`, `generatedAt`, transaction
  client, and deadline signal.
- Every attributable query must use `context.transaction`; importing/calling the global database
  client, opening a nested transaction, or querying after `contribute` resolves is forbidden.
- The transaction is PostgreSQL REPEATABLE READ and read-only. Contributors perform no writes,
  advisory locks, DDL, provider calls, filesystem access, network request, queue operation, or log
  containing result data.
- Contributors check `context.signal` before and after meaningful work and propagate cancellation.
- Queries must be bounded by `userId` and deterministic ordering. A contributor must not scan data
  for other accounts and filter it in application memory.
- `generatedAt` is the database transaction timestamp and is the only freshness reference for all
  sections.

## Included, Empty, and Unavailable Results

### Included

`status: "included"` always produces a `sections[namespace]` wrapper and an
`includedSections` manifest entry with matching schema version.

### Empty

No records is still `status: "included"`. The contributor returns its schema-defined empty value,
for example `[]` or an object whose nullable member is null. Empty data never silently disappears
and never uses unavailable.

### Unavailable

`status: "unavailable"` is valid only when:

- the reason is a fixed non-sensitive category listed in the declaration;
- the condition is expected and not an exception, timeout, validation failure, or dependency error;
- no partial payload is returned.

It produces one `unavailableSections` manifest entry and no `sections[namespace]` property.
Example categories include `not_applicable` and `feature_disabled`; free-form explanations and
exception messages are forbidden.

### Failure

A throw/rejection, cancellation, timeout, undeclared unavailable reason, version/namespace mismatch,
non-JSON value, cyclic object, invalid number, unordered result, or query outside the shared context
fails the whole export generically. The orchestrator returns no envelope or partial attachment.

## JSON Value and Determinism Contract

- Allowed values are null, booleans, finite numbers, strings, arrays, and plain string-keyed objects.
- Date values must become UTC ISO 8601 strings before return.
- `undefined`, bigint, NaN, Infinity, functions, symbols, class instances, maps, sets, buffers,
  streams, and cyclic references are invalid.
- The canonical serializer recursively sorts object keys.
- Contributors sort non-identical arrays by stable fields that are included in each item. Hidden
  database IDs may be used only inside a query to make selection deterministic; they must not be
  returned and are unnecessary when projected items serialize identically.
- Repeating contribution over the same snapshot and registry must produce the same canonical section
  bytes.
- A contributor must not include current clock time, random values, request metadata, or external
  mutable data; use only `generatedAt` when a snapshot timestamp is required.

## Version Contract

- Envelope and section versions are independent positive integers.
- Increment a section version whenever its shape, field classification, interpretation, units,
  nullability meaning, or ordering semantics changes.
- Ordinary record-value changes do not increment a section version.
- Adding a new namespace or incrementing one section does not increment the envelope version.
- Increment the envelope version only for an incompatible change to top-level or manifest shape or
  meaning.
- Every manifest entry and included section wrapper must equal the declaration's version.

## Privacy Contract

Every contributor uses an explicit allowlist projection. It must never return:

- database IDs, foreign keys, normalized/internal duplicates, or provider account IDs;
- passwords, cookies, Session tokens, verification credentials, magic links, access/refresh/ID
  tokens, provider secrets, grant rows, rate-limit keys/counters, or CSRF values;
- IP addresses, geolocation, user-agent strings, fingerprints, inferred device/location names, raw
  request data, or operational diagnostics;
- globally shared/static content unless required to interpret an account-linked record and
  redistribution is permitted.

Fields are grouped or documented as `user_provided`, `observed`, or `derived` whenever that
distinction changes how a recipient interprets them. Contributor data and errors never enter logs.

## Built-In Contributor Contracts

### `account` version 1

- `userProvided`: `name`, `email`, `image`.
- `observed`: `status`, `emailVerifiedAt`, `createdAt`, `updatedAt`, and `linkedProviders` containing
  only `provider` and `type`.
- Provider list sorts by the two included fields.
- Null profile values remain explicit null.

### `policyAcceptances` version 1

- `observed`: `termsVersion`, `privacyVersion`, `acceptedAt`.
- No acceptance returns an included empty object, not unavailable.
- Internal ID, User ID, and duplicate persistence timestamp are excluded.

### `activeSessions` version 1

- Each item has `observed.createdAt`, `observed.expiresAt`, and
  `observed.authenticatedAt`; `derived.current` and `derived.recentlyAuthenticated`.
- Only Sessions active at `generatedAt` for the exact User are selected.
- Sort by included timestamps/current value and canonical item bytes; null legacy evidence remains
  null.
- No Session selector, credential, network/device value, or inferred label is returned.

## Fixture Product Contributor

Contract tests define a fixture declaration such as `journal.entries` version 1. Its data includes:

- user-provided entry text/title;
- observed creation/update timestamps;
- a derived non-sensitive summary such as character count.

The fixture proves registration injection and classification without adding journal knowledge to
framework core. Tests cover complete registration, missing contributor, extra contributor,
duplicate namespace, explicit empty list, allowlisted unavailable, undeclared unavailable,
nondeterministic array, thrown error, cancellation, and forbidden/non-JSON values.

## Contract Completion Assertions

A registry/export contract passes only when:

1. declared and contributed namespace sets are exactly equal and unique;
2. versions are positive integers and match declaration/result/manifest/section;
3. every no-record fixture is included with an explicit empty value;
4. only allowlisted expected conditions become unavailable;
5. any runtime/validation failure returns no envelope;
6. all reads use the supplied transaction and one snapshot timestamp;
7. repeated canonical output for the same fixture snapshot is byte-identical;
8. forbidden-field scanning finds zero matches in built-in and fixture output;
9. framework core has no import of the fixture/product contributor.
