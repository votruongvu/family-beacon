# ENG-FND-0001 — Flutter and Firebase Clean-Architecture Baseline

Type: Engineering Foundation

## Status

Ready

## Version

1

## Charter Version

1

## Outcome

The project has a runnable, testable Flutter and Firebase baseline — with enforced architecture boundaries, isolated environments, and automated verification — from which product Requirements can be implemented consistently.

## Context

The repository contains only a LICENSE, a Flutter-template ignore file, and product documentation. There is no application manifest, no source tree, no Firebase configuration, and no test harness, so every decision here establishes a contract rather than changing one. The remote is a GitHub repository.

Project Charter version 1 makes consent, honesty about location freshness, and the absence of hidden tracking product-defining rather than incidental. This Foundation therefore treats authorization, privacy, and freshness integrity as architecture constraints, not as feature detail to be decided later.

Two previously open technical decisions were resolved by explicit confirmation while creating this Foundation: Cloud Functions run TypeScript on Node.js, and continuous verification runs on GitHub Actions. All other open technical decisions from the source material remain unresolved and are recorded under Deferred Decisions.

## Shared Contract

- Application code is organized by product capability, and each feature owns its own presentation, domain, and data layers. Cross-cutting technical concerns live in a shared core; application-wide wiring lives in an application layer.
- Dependencies point inward. Presentation depends on Domain, Data depends on Domain, and Domain depends on neither. Domain code is pure Dart and imports no Flutter, Firebase, Google Maps, location plugin, or platform SDK.
- Infrastructure data transfer objects are converted to domain entities through named mapper code. External SDK objects never cross out of the Data layer.
- One feature's Data layer never imports another feature's Data layer. Sharing happens by promoting a domain concept, not through an implementation shortcut.
- Riverpod orchestrates, Domain decides. Providers resolve dependencies, invoke use cases, and expose asynchronous state; business rules live in entities, value objects, policies, and use cases.
- The router owns navigation and never owns authorization. Route guards shape the user experience; the backend remains the authority on access.
- Operations with elevated trust or cross-user effect execute in trusted backend code. The client holds no server credentials and never dispatches push messages.
- Authorization fails closed and is enforced in depth by security rules and backend checks. Client-side checks are user experience only and are never a security boundary.
- Infrastructure exceptions never reach Presentation. Data-layer errors are translated into typed domain failures.
- Device location is reached through an application-owned contract that is replaceable without touching Domain, and every location carries its capture time, receipt time, and accuracy.
- Development, staging, and production are isolated and have separate backend projects and credentials. Local development and automated verification run against emulators, never against production by default.
- No secret is committed to source control. Configuration distinguishes public client configuration, restricted API credentials, and server-side secrets, and provider keys carry platform and API restrictions.
- Logs carry no sensitive payload: no one-time password, authentication token, device token, plaintext phone number, or precise coordinate. Diagnostic context is structured and uses hashed identifiers.
- A single fixed verification command set runs locally and in continuous integration, and a forbidden dependency direction fails the build rather than relying on review.

## Scope

- Flutter application bootstrap targeting iOS and Android: manifest, entry point, application shell, an application layer holding bootstrap, routing, and configuration, a core layer holding error, result, logging, time, permissions, and shared concerns, and an empty feature root.
- Riverpod composition root and the state-orchestration convention.
- Router route table and guard mechanism, using placeholder destinations only.
- Environment-aware configuration for development, staging, and production, with per-environment backend options and no committed secrets.
- Firebase client initialization for Authentication, Firestore, Functions, Messaging, App Check, and Crashlytics — wired and reachable, with no business use.
- Cloud Functions project in TypeScript on Node.js: structure, a shared authorization helper, emulator wiring, and a test harness. No business functions.
- Firestore Security Rules with a deny-by-default baseline and its rules-test harness.
- Local emulator suite configuration for Authentication, Firestore, and Functions, with test phone numbers available for development.
- Core error and typed-failure model, a result type, and the data-to-domain failure translation convention.
- Privacy-safe structured logging with crash reporting as the baseline.
- The location abstraction contract and its snapshot model, with an initial adapter proving the boundary is replaceable.
- Lint and format configuration.
- Test harness covering domain unit tests, widget tests, an integration test entry point, security-rules tests, backend tests, and automated architecture-dependency checks.
- A continuous integration workflow on GitHub Actions running the full verification command set on every push and pull request.
- A minimal vertical proof slice: a non-business feature exercising presentation, provider, use case, repository, and datastore through the emulator, demonstrating the contract end to end.
- Developer setup documentation covering prerequisites, environment selection, starting the emulators, and every verification command.

## Acceptance

- The application starts on an iOS simulator and an Android emulator against the development environment.
- Switching the selected environment targets a different backend project without any code change.
- The application starts with the emulator suite running and makes no production call.
- One documented command runs formatting, static analysis, tests, architecture checks, and rules tests, and all pass on a clean checkout.
- The architecture check fails when a deliberate infrastructure import is added to a domain file, and passes once it is removed.
- The domain unit test suite runs without a Flutter binding and without any emulator.
- The security-rules test suite demonstrates that the deny-by-default baseline rejects unauthenticated access and access across tenant boundaries.
- A backend function test runs against the emulator and passes.
- The vertical proof slice reads and writes through the emulator, and no file in its domain path imports an infrastructure package.
- The continuous integration workflow runs on push and reports a pass or fail result for every verification stage.
- No credential, service-account key, or production secret is present in the repository, and dependency resolution is reproducible from committed lock files.
- A developer can go from a fresh clone to a running application and a passing verification run using only the setup documentation.

## Constraints

- Project Charter version 1 governs this baseline: nothing established here may enable hidden tracking, allow one person to enable another person's sharing, or present an old location as a current one.
- Managed backend capabilities are preferred over custom infrastructure. Adopting a service beyond Authentication, Firestore, Functions, Messaging, App Check, Crashlytics, and the emulator suite requires an accepted decision.
- The application targets iOS and Android only.
- No location history is persisted.
- Application attestation must be enforceable in production while still permitting controlled local and emulator testing.
- Exact framework, language, and package versions are chosen during bootstrap against compatibility verified at that time, and are then locked.
- The declared technical non-goals stay out: microservices, container orchestration, custom authentication, one-time-password, push, map, or socket infrastructure, event sourcing, distributed event streaming, route-history storage, geospatial warehousing, generic plugin frameworks, multiple backend providers, multi-region active-active architecture, premature offline-first synchronization, and any background service designed to evade platform policy.

## Protected Areas

- The Faro store and the active Project Charter must remain untouched.
- The existing LICENSE and the product documentation must remain unchanged.
- The existing ignore rules must continue to exclude build output and platform artifacts. They may be amended only where they currently prevent committing a dependency lock file.

## Deferred Decisions

- Exact framework and language SDK versions, chosen at bootstrap from a verified-compatible pair.
- Exact package versions, selected after compatibility verification and then locked.
- The physical collection and document layout of the datastore, designed per Requirement. This Foundation establishes only the deny-by-default rules baseline and its test harness.
- The background location implementation strategy, which requires validation on physical devices.
- Production location update frequency and distance thresholds, which require device and battery testing.
- The thresholds separating live, recent, stale, and unavailable location freshness.
- Mobile distribution and release signing workflow.
- Whether product analytics is adopted.
- Whether managed media storage is required for user avatars.
- Retention rules for resolved, cancelled, and expired assistance records.
- Whether a version manager pins the framework toolchain.

## Out of Scope

- Phone one-time-password authentication and the sign-in flow. This is a functional Requirement.
- User profile management. This is a functional Requirement.
- Family creation, membership, and invitations. This is a functional Requirement.
- Location sharing consent and collection. This is a functional Requirement.
- The family map. This is a functional Requirement.
- Assistance request activation, notification, acknowledgement, and resolution. This is a functional Requirement.
- The concrete security rules and backend functions that implement those capabilities.
- Visual and interaction design: colour, typography, spacing, iconography, the component library, loading, empty, error and success states, location freshness presentation, and the accessibility baseline for elderly users. This belongs to a UX Foundation.

## Dependencies

None

## Used By

None

## Sources

- Document: docs/family-beacon-technical-foundation.md
- Document: docs/family-beacon-project-charter.md
- Project Charter version 1
- Repository state at creation: no application code, GitHub remote
- Confirmed during creation: Cloud Functions use TypeScript on Node.js; continuous verification runs on GitHub Actions
