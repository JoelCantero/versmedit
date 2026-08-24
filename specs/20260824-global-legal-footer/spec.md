# Feature Specification: Global Legal Footer

**Feature Branch**: `20260824-global-legal-footer`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "GitHub issue #44 - Add a global footer with legal links"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach Legal Information from Any Page (Priority: P1)

As a visitor or authenticated user, I can reach the Terms of Use and Privacy Notice from any normal user-facing page so that I can review legal information without returning to a specific entry page or knowing a direct address.

**Why this priority**: Persistent access to legal information is the feature's primary user value. Without global coverage, users can still become stranded on pages that provide no path to the legal content.

**Independent Test**: Visit one public, authentication, authenticated account, Terms of Use, and Privacy Notice page while signed in and signed out where each state is valid. Every page provides exactly one footer after its main content, and that footer provides both legal destinations.

**Acceptance Scenarios**:

1. **Given** any normal user-facing page in the localized application, **When** the page is displayed, **Then** exactly one footer appears after the page's main content and offers Terms of Use and Privacy Notice as its only navigation destinations.
2. **Given** a user is signed in or signed out, **When** the user moves among public, authentication, account, and legal pages available to that state, **Then** the same two legal destinations remain available in exactly one footer on every page.
3. **Given** a user is already viewing the Terms of Use or Privacy Notice, **When** the page is displayed, **Then** the footer remains present and both legal destinations remain valid.

---

### User Story 2 - Keep the Active Language (Priority: P2)

As a user browsing in English, Spanish, or Catalan, I can read the footer in that language and follow its links without losing my selected language.

**Why this priority**: A legal destination in the wrong language undermines comprehension and makes the global navigation inconsistent with the rest of the localized experience.

**Independent Test**: Open a representative page in each supported language, verify the footer labels and navigation name are localized, and activate both links. Each destination retains the active language and uses its canonical localized address.

**Acceptance Scenarios**:

1. **Given** English is active, **When** the user follows either footer link, **Then** the destination is the unprefixed `/terms` or `/privacy` page and all footer text is English.
2. **Given** Spanish is active, **When** the user follows either footer link, **Then** the destination retains the `/es` prefix and all footer text is Spanish without English fallback text.
3. **Given** Catalan is active, **When** the user follows either footer link, **Then** the destination retains the `/ca` prefix and all footer text is Catalan without English fallback text.
4. **Given** a user changes language before using the footer, **When** the user activates a legal link, **Then** the newly selected language is preserved at the destination.

---

### User Story 3 - Use the Footer Across Devices and Access Methods (Priority: P3)

As a keyboard, screen-reader, mobile, or desktop user, I can identify and use the legal links without the footer obscuring content or becoming unreadable.

**Why this priority**: Global presence is only useful when the footer remains operable and understandable across supported layouts, themes, and assistive technologies.

**Independent Test**: On short, long, and dynamically expanding pages, verify the footer with keyboard and screen-reader navigation at representative mobile and desktop sizes in light and dark themes. Both links remain identifiable, focusable, readable, and unobstructed.

**Acceptance Scenarios**:

1. **Given** a keyboard user reaches the footer, **When** focus moves through its navigation, **Then** both links receive visible focus in a predictable Terms-then-Privacy order and can be activated.
2. **Given** a screen-reader user navigates by page region or link, **When** the footer is encountered, **Then** the footer and its legal navigation have meaningful localized names and each link's purpose is clear without surrounding context.
3. **Given** a page whose content is shorter than the viewport, **When** the page is displayed, **Then** the footer reaches the bottom of the viewport without floating over the main content.
4. **Given** a long page or a page whose content expands after load, **When** the user reaches the end of the main content, **Then** the footer follows that content in normal reading order and does not cover it.
5. **Given** a representative mobile or desktop viewport in light or dark theme, **When** the footer is displayed, **Then** it has no clipping, overlap, horizontal overflow, content obstruction, unreadable text, or invisible focus state.

### Edge Cases

- A user changes language and immediately follows a footer link; the destination uses the newly active language rather than the prior one.
- The current page is already Terms of Use or Privacy Notice; the footer remains unique and both links continue to resolve correctly.
- Main content is empty, shorter than the viewport, longer than several viewports, or expands after initial display; the footer never overlaps or obscures it.
- Translated labels wrap at narrow widths; wrapping does not introduce horizontal scrolling, clipping, or overlap.
- Authentication state changes while navigating; footer availability, content, and destinations do not change.
- A page includes nested layouts or other shared navigation; it still renders one footer rather than duplicates.

### Verification Strategy

- Automated verification covers at least one public page, one authentication page, one authenticated account page, Terms of Use, and Privacy Notice in every supported language, including signed-in and signed-out states where the route permits them.
- Automated verification confirms global presence, exactly one footer, exactly two legal destinations, translated labels and navigation name, locale-preserving addresses, link order, and valid behavior on the legal pages themselves.
- Accessibility verification confirms semantic regions, a meaningful localized navigation name, descriptive links, keyboard order and activation, and visible focus.
- Visual and interaction verification covers light and dark themes at 320 x 568, 768 x 1024, and 1440 x 900 viewports using short, long, and dynamically expanding content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every normal user-facing localized route MUST display exactly one global footer, including representative public, authentication, authenticated account, Terms of Use, and Privacy Notice pages.
- **FR-002**: Footer presence, content, order, and destinations MUST remain the same whether the user is signed in or signed out.
- **FR-003**: The footer MUST appear after the page's main content in document and reading order.
- **FR-004**: On pages shorter than the viewport, the footer MUST reach the bottom of the viewport without covering main content.
- **FR-005**: On long or dynamically expanding pages, the footer MUST follow all main content and MUST NOT float over or obscure that content.
- **FR-006**: The initial footer MUST expose exactly two navigation destinations, ordered as Terms of Use followed by Privacy Notice, with no additional footer destinations or actions.
- **FR-007**: The Terms of Use destination MUST be `/terms` for English, `/es/terms` for Spanish, and `/ca/terms` for Catalan.
- **FR-008**: The Privacy Notice destination MUST be `/privacy` for English, `/es/privacy` for Spanish, and `/ca/privacy` for Catalan.
- **FR-009**: The footer link labels and the legal navigation's accessible name MUST be localized for English, Spanish, and Catalan, with no untranslated fallback text in any supported language.
- **FR-010**: Changing the active language before activating a footer link MUST preserve the newly selected language at the legal destination.
- **FR-011**: The footer MUST provide semantic footer and navigation regions, and the navigation region MUST have a meaningful localized name that identifies its legal purpose.
- **FR-012**: Each link MUST communicate its destination clearly when announced or read without surrounding footer text.
- **FR-013**: Keyboard users MUST be able to focus and activate both links in Terms-then-Privacy order, with a visible focus indicator in every supported theme.
- **FR-014**: At supported mobile and desktop sizes, footer content MUST wrap without clipping, overlap, horizontal overflow, or obstruction of adjacent content.
- **FR-015**: In light and dark themes, footer text and links MUST have a contrast ratio of at least 4.5:1 against their background, or 3:1 for large text, and focus indicators MUST have at least 3:1 contrast against adjacent colors.
- **FR-016**: A future footer destination MUST be addable globally without requiring route-by-route footer changes.
- **FR-017**: Framework-generated error documents that do not use the localized application page frame are outside global footer coverage for this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of routes in the defined public, authentication, authenticated account, and legal-page verification matrix display exactly one footer in every supported language and permitted authentication state.
- **SC-002**: All six locale-destination combinations resolve to the expected Terms of Use or Privacy Notice address, preserve the active language, and display fully localized footer text with no fallback copy.
- **SC-003**: Keyboard and screen-reader verification completes both legal-link journeys with both links identified, focused, and activated in the expected order on 100% of sampled pages.
- **SC-004**: The defined viewport, theme, and content-length matrix produces zero instances of clipping, overlap, horizontal overflow, content obstruction, or invisible focus, and every contrast measurement meets the ratios in FR-015.
- **SC-005**: In a usability check with at least 10 first-time participants, each participant attempts one randomly assigned Terms of Use or Privacy Notice journey from a sampled public, authentication, account, or legal page. At least 9 participants MUST reach the requested page on their first attempt within 20 seconds.
- **SC-006**: A review exercise can add one additional footer destination across 100% of in-scope pages without any route-specific footer change.

## Assumptions

- The existing Terms of Use and Privacy Notice pages remain the canonical legal destinations and their content does not change as part of this feature.
- English, Spanish, and Catalan are the complete supported language set for this release; English remains unprefixed while Spanish and Catalan use `/es` and `/ca`.
- "Every page" means every normal user-facing route using the localized application page frame. Generated error documents outside that frame remain out of scope.
- The footer has identical legal content for visitors and authenticated users and contains no account-specific or route-specific actions.
- Existing light and dark themes remain authoritative; this feature adapts the footer to them rather than redesigning either theme.
- The feature introduces no new user data, stored preferences, consent state, analytics requirement, or legal-policy version.
- In-scope routes share an application-wide page frame capable of presenting persistent navigation, and the existing localized legal destinations remain available throughout delivery.

## Non-Goals *(mandatory)*

- Creating, rewriting, or versioning Terms of Use or Privacy Notice content.
- Adding cookie consent, consent preferences, social links, contact links, marketing navigation, or any footer destination beyond the two legal links.
- Redesigning the existing header, page content, themes, or primary application navigation.
- Adding route-specific business actions, account controls, or authentication-dependent footer content.
- Changing policy-acceptance behavior, authentication behavior, or account lifecycle rules.
- Extending footer coverage to generated error documents outside the localized application page frame.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: The footer and existing legal destinations are public and MUST remain equally available before and after authentication; this feature adds no privileged action or authorization decision.
- **Account lifecycle**: Registration, sign-in, sign-out, and account creation behavior are outside scope and MUST remain unchanged.
- **Authentication provider verification**: This feature does not add or modify an authentication provider boundary.
- **Data sensitivity**: The footer collects, stores, and transmits no user data, secrets, consent choices, or regulated information.
- **Input validation**: The feature accepts no user-provided content; navigation behavior is limited to the supported language set and fixed canonical legal destinations.
- **Log hygiene**: Footer navigation MUST NOT introduce logs containing personal data, authentication state, secrets, or full browsing histories.
- **Public exposure**: No new public endpoint is introduced; the footer only makes the existing intentionally public legal pages persistently discoverable.