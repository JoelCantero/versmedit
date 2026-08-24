# UI Contract: Global Legal Footer

## Contract Scope

This contract defines the user-visible and accessibility interface for the shared legal footer. It
does not add an HTTP API, server action, data format, event schema, or persistence contract.

## Composition Contract

The localized application layout owns the footer and renders this sibling order:

1. Shared application header
2. Flex-growing page-content region
3. Shared legal footer

The layout MUST render one footer instance and individual pages MUST render none. All normal routes
under `src/app/[locale]/` inherit that instance, including the legal pages themselves. Framework-
generated documents outside this layout remain outside the contract.

## Component Boundary

| Property | Contract |
|----------|----------|
| Owner | `src/app/[locale]/layout.tsx` |
| Component | `src/components/app-footer.tsx` |
| Rendering | Server-rendered; no custom client boundary or hydration state |
| Input | Active locale already validated by the layout (`en`, `es`, or `ca`) |
| Authentication | No session input or conditional rendering |
| Destination source | Existing `POLICY_PATHS` collection |
| Translation source | `Footer.navigationLabel`, `Policies.terms.title`, `Policies.privacy.title` |

## Semantic DOM Contract

```text
footer (contentinfo landmark; exactly one)
`-- nav (localized accessible name; exactly one within footer)
    `-- ul
        |-- li
        |   `-- Terms link
        `-- li
            `-- Privacy link
```

- Native `footer`, `nav`, list, and anchor semantics MUST be used; no redundant custom landmark or
  link roles.
- The navigation MUST have the localized accessible name from the table below.
- The footer MUST contain exactly two links and no buttons, menus, account controls, marketing
  destinations, consent controls, or route-specific actions.
- DOM, visual, reading, and keyboard order MUST all be Terms followed by Privacy.
- Each link's accessible name MUST equal its visible legal-page title and remain understandable
  outside surrounding context.
- Semantic roles and accessible names are the test interface; no `data-testid` is required.

## Localization Contract

| Locale | Navigation accessible name | Terms label | Privacy label |
|--------|----------------------------|-------------|---------------|
| `en` | Legal information | Terms of Use | Privacy Notice |
| `es` | Información legal | Términos de uso | Aviso de privacidad |
| `ca` | Informació legal | Condicions d'ús | Avís de privacitat |

- The navigation name is added under `Footer.navigationLabel` in every catalog.
- Link labels reuse the existing policy title keys rather than duplicate footer-specific copy.
- Missing keys or English fallback text in Spanish/Catalan fail the contract.

## Navigation Contract

The component passes canonical unprefixed `POLICY_PATHS` values to the project's locale-aware
`Link`. Rendered hrefs and destinations MUST match:

| Active locale | Terms href/destination | Privacy href/destination |
|---------------|------------------------|--------------------------|
| `en` | `/terms` | `/privacy` |
| `es` | `/es/terms` | `/es/privacy` |
| `ca` | `/ca/terms` | `/ca/privacy` |

- Activating either link performs normal application navigation and preserves the active locale.
- A locale selected immediately before activation determines the destination locale.
- On Terms or Privacy itself, both links remain present and valid; the current-page link MAY
  navigate to the same canonical page and MUST NOT disappear or become disabled.
- Query strings from the source page are not copied into legal destinations.

## Layout and Responsive Contract

- The footer participates in normal document flow and MUST NOT use fixed, sticky, absolute, or
  overlay positioning.
- On a page shorter than the viewport, the flex-growing content region pushes the footer's lower
  edge to the viewport bottom.
- On a long or dynamically expanding page, the footer follows the final content edge and moves
  downward as content grows; it never covers main content.
- Footer content may wrap into additional lines. At widths down to 320 CSS pixels, it MUST create no
  horizontal document overflow, clipping, collision, or off-screen link text.
- Every link exposes at least 24 CSS pixels of target height; spacing keeps adjacent target regions
  distinct when labels wrap.
- Footer height is content-driven and MUST NOT reserve a fixed single-line height.

## Theme and Focus Contract

- Background, foreground, muted foreground, border, and focus colors use existing semantic theme
  tokens; the component does not define raw light/dark color pairs.
- Normal text and links meet at least 4.5:1 contrast against the footer background, or 3:1 if they
  qualify as large text.
- Focus indication meets at least 3:1 contrast against adjacent colors and remains visible in light,
  dark, and forced-colors modes.
- Native Tab navigation reaches Terms then Privacy. Enter activates the focused link. Focus is not
  hidden or obscured by footer styling.
- The component introduces no animation; reduced-motion behavior is unchanged.

## Authentication Contract

Footer markup, labels, order, hrefs, and availability are identical for authenticated and
unauthenticated users. Authentication changes MAY alter the header or page content but MUST NOT
alter this footer contract.

## Verification Matrix

For every locale, production-artifact E2E MUST cover:

| Route category | English | Spanish | Catalan | Required state |
|----------------|---------|---------|---------|----------------|
| Public | `/` | `/es` | `/ca` | Signed out |
| Authentication | `/login` | `/es/login` | `/ca/login` | Signed out |
| Account | `/account` | `/es/account` | `/ca/account` | Signed in |
| Terms | `/terms` | `/es/terms` | `/ca/terms` | Signed out |
| Privacy | `/privacy` | `/es/privacy` | `/ca/privacy` | Signed out |

Each sampled page MUST assert:

- One `contentinfo` landmark and one legal navigation inside it
- Two links with exact localized names, order, and hrefs
- Successful navigation to both canonical destinations
- Footer position after page content and absence of horizontal overflow
- No serious or critical WCAG A/AA axe violations attributable to the footer

The signed-in account sample additionally proves authentication independence by comparing the same
footer contract with signed-out samples.

## Compatibility and Evolution

A future destination is added to the single ordered destination collection and catalog sources. No
page or route layout is edited. Any future addition changes the cardinality and ordering clauses of
this contract explicitly; the initial release remains fixed at two destinations.