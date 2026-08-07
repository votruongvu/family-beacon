# ENG-FND-0001 — Implementation

## Context Revalidation

The repository was inspected before routing and carries no application code: a licence, ignore rules from the framework template, the product documentation, the Faro store, and no manifest, source tree, backend configuration, or tests. Nothing exists to reuse, and no existing pattern constrains the structure, so every element of the Shared Contract is established here for the first time rather than adapted.

Two conditions were cleared on the source branch before the Foundation branch was created: the technical foundation document was committed, and the Faro store was removed from the ignore rules and committed, so the Charter and this Foundation are now tracked and the per-slice records this workflow produces can be committed with the code they describe.

The local toolchain was verified as capable of building and running both targets. The backend command line tool is absent and no backend projects exist, which does not block the baseline but does limit two Acceptance items to structural and emulator verification, as recorded in the Confirmed Decisions.

The Charter's durable boundaries were re-read and are treated as architecture constraints here rather than as later feature concerns: consent, the absence of hidden tracking, honesty about location freshness, and the prohibition on location history all constrain what this baseline may make possible.

## Implementation Summary

The repository has no application code, so this Foundation creates the entire technical baseline rather than changing one. Seven Foundation Slices build it in an order that leaves the project runnable at every step: project initialization, then the architecture boundaries and the automated check that enforces them, then environment configuration and backend client initialization, then the application shell and navigation, then the backend baseline with its emulators, then a vertical proof that the contract holds end to end, and finally continuous verification and developer documentation.

The local toolchain was verified before routing: Flutter 3.44.8 with Dart 3.12.2, Xcode 26.6 with CocoaPods 1.16.2, Android SDK 36.1.0, Node.js 25.1.0 with npm 11.6.2, an available Android virtual device, and available iOS simulators. The Firebase command line tool is not installed and no Firebase projects exist, which shapes the verification approach recorded below.

No business capability is implemented. Authentication, profile, family, invitations, location sharing, the family map, and assistance requests remain functional Requirements, and the visual and interaction contract remains a UX Foundation.

Independent final review: required — seven integrated slices establishing architecture boundaries, authorization enforcement, and privacy-sensitive configuration, with two Acceptance items the available environment cannot fully prove.

## Confirmed Decisions

- Backend functions are written in TypeScript on Node.js, and continuous verification runs on GitHub Actions.
- The baseline is verified against the local emulator suite. The three-environment configuration structure is real, its backend project values are committed placeholders that the standard configuration tool overwrites, and verification against real backend projects is reported as pending rather than claimed.
- Application identifiers are `com.familybeacon.app` for production, `com.familybeacon.app.dev` for development, and `com.familybeacon.app.stg` for staging, so all three builds can coexist on one device and environment isolation is observable.
- The Faro store is tracked in version control, so the Charter, this Foundation, and its records live beside the code they govern.
- Forbidden dependency directions are detected by a project-owned check that runs locally and in continuous integration, rather than by a third-party analysis product.

## Implementation Units

### FS-001 — Initialize the project and its supported targets

**Goal**

Create the application project for iOS and Android with its permanent identifiers, formatting and static analysis configuration, and reproducible dependency resolution.

**Expected Behavior**

The project builds and runs on both target platforms. Formatting and static analysis run from the command line and pass. Resolved dependency versions are committed so a fresh clone resolves identically.

**Expected Change Areas**

Application manifest, platform target directories, static analysis configuration, ignore rules for the dependency lock file, and the entry point.

**Verification**

Static analysis and formatting checks pass. The application builds for both platforms. A clean checkout resolves dependencies from the committed lock file.

**Dependencies**

None

### FS-002 — Establish architecture boundaries and the shared core

**Goal**

Create the layered source structure, the shared core the whole project depends on, and the automated check that makes the dependency direction enforceable rather than advisory.

**Expected Behavior**

The source tree separates application wiring, shared core concerns, and features, and each feature can hold its own presentation, domain, and data layers. A result type and a typed failure model exist for translating infrastructure errors. Structured logging exists and refuses sensitive payloads. A check detects a forbidden import in a domain file and fails.

**Expected Change Areas**

Application layer, core layer covering error, result, logging, and time concerns, an empty feature root, the architecture check and its own tests, and domain-level unit tests.

**Verification**

The architecture check passes on the clean tree, and fails when a deliberate infrastructure import is added to a domain file. Domain tests run without a UI framework binding and without any emulator.

**Dependencies**

FS-001

### FS-003 — Establish environment configuration and backend client initialization

**Goal**

Make the three environments real and isolated, and initialize the backend client services without using any of them for business behavior.

**Expected Behavior**

Development, staging, and production are selectable at build time, each carrying its own identifier and backend configuration. Switching environment requires no code change. Backend services for authentication, data, functions, messaging, attestation, and crash reporting are initialized and reachable. When emulator mode is selected the client connects to local emulators. No secret is committed.

**Expected Change Areas**

Environment configuration in the application layer, platform build configuration for the three variants, per-environment backend option placeholders, an example configuration file, backend initialization at bootstrap, and ignore rules for generated configuration.

**Verification**

Each environment variant builds and reports its own identifier and configuration. Emulator mode is observable at startup. A search of the tree finds no credential or service-account key.

**Dependencies**

FS-002

### FS-004 — Establish the application shell, navigation, and state orchestration

**Goal**

Create the shell later features plug into: the dependency-resolution root, the route table with a guard mechanism, and crash reporting wired to real failures.

**Expected Behavior**

The application starts into a shell with placeholder destinations. Routing is declarative and centrally defined, and a guard mechanism exists that reads application state without becoming an authorization boundary. Providers resolve dependencies and expose asynchronous state, and hold no business rule. Uncaught errors reach crash reporting.

**Expected Change Areas**

Application shell and bootstrap, the route table and guard, the composition root, and widget tests covering the shell and a guarded route.

**Verification**

The application starts on an iOS simulator and an Android virtual device in the development variant. Widget tests cover the shell and the guard's redirect behavior.

**Dependencies**

FS-003

### FS-005 — Establish the backend baseline and local emulators

**Goal**

Create the trusted backend project, the deny-by-default access rules, the emulator configuration, and the two test harnesses that verify them.

**Expected Behavior**

A backend functions project exists with a shared authorization helper and no business function. Access rules deny everything not explicitly allowed. The emulator suite starts for authentication, data, and functions. Rules tests prove unauthenticated access and access across tenant boundaries are rejected. A function test runs against the emulator.

**Expected Change Areas**

Backend functions project with its own manifest, lock file, and static analysis, the security rules file, emulator and project configuration, the rules test suite, the function test suite, and a repository-level manifest pinning the backend tooling.

**Verification**

The rules test suite passes against the emulator and demonstrates both rejections. The function test passes against the emulator. The application starts against the emulator suite and makes no production call.

**Dependencies**

FS-003

### FS-006 — Prove the contract with a vertical slice and the location abstraction

**Goal**

Demonstrate that the architecture actually works end to end, and that the device location boundary is genuinely replaceable, without introducing a business capability.

**Expected Behavior**

A minimal non-business feature carries a request from the interface through a provider, a use case, and a domain contract to a data implementation and the emulated datastore, and back. Its domain path imports no infrastructure package. A location contract exists in the domain with an adapter behind it, and a second in-memory adapter proves the boundary by substituting without any domain change. Every location carries capture time, receipt time, and accuracy.

**Expected Change Areas**

One proof feature spanning its three layers, the location contract and its snapshot model in the shared domain, an initial platform adapter and a substitutable test adapter, and their tests.

**Verification**

The proof feature reads and writes through the emulator. The architecture check confirms no infrastructure import in the domain path. Domain tests substitute the location adapter without modification.

**Dependencies**

FS-004, FS-005

### FS-007 — Establish continuous verification and the developer workflow

**Goal**

Make the whole verification set runnable by one command and enforced on every push, and document the path from a fresh clone to a running application.

**Expected Behavior**

One documented command runs formatting, static analysis, application tests, the architecture check, backend tests, and rules tests. The same stages run in continuous integration on push and pull request and report per-stage results. Setup documentation covers prerequisites, environment selection, starting the emulators, running the application, and every verification command.

**Expected Change Areas**

A verification entry point script, the continuous integration workflow, and the developer setup documentation.

**Verification**

The single command completes on a clean checkout with every stage passing. The workflow definition covers each stage and its triggers. The documented setup path is followed and produces a running application and a passing verification run.

**Dependencies**

FS-001, FS-002, FS-003, FS-004, FS-005, FS-006

## Acceptance Coverage

| Requirement Acceptance | Covered By |
|---|---|
| The application starts on an iOS simulator and an Android emulator against the development environment. | FS-004 |
| Switching the selected environment targets a different backend project without any code change. | FS-003 |
| The application starts with the emulator suite running and makes no production call. | FS-005 |
| One documented command runs formatting, static analysis, tests, architecture checks, and rules tests, and all pass on a clean checkout. | FS-007 |
| The architecture check fails when a deliberate infrastructure import is added to a domain file, and passes once it is removed. | FS-002 |
| The domain unit test suite runs without a Flutter binding and without any emulator. | FS-002 |
| The security-rules test suite demonstrates that the deny-by-default baseline rejects unauthenticated access and access across tenant boundaries. | FS-005 |
| A backend function test runs against the emulator and passes. | FS-005 |
| The vertical proof slice reads and writes through the emulator, and no file in its domain path imports an infrastructure package. | FS-006 |
| The continuous integration workflow runs on push and reports a pass or fail result for every verification stage. | FS-007 |
| No credential, service-account key, or production secret is present in the repository, and dependency resolution is reproducible from committed lock files. | Final Foundation Review |
| A developer can go from a fresh clone to a running application and a passing verification run using only the setup documentation. | Final Foundation Review |

## Protected Areas

- The Faro store and the active Project Charter must remain untouched.
- The existing LICENSE and the product documentation must remain unchanged.
- The existing ignore rules must keep excluding build output and platform artifacts. The only permitted amendment is the exception that allows the dependency lock file to be committed, plus new rules for generated backend configuration.
- No business capability may be implemented: authentication, user profile, family creation, invitations, location sharing consent, the family map, and assistance requests all remain functional Requirements.
- Nothing may enable hidden tracking, allow one person to enable another person's sharing, or present an old location as a current one.
- No location history may be persisted.

## Current Progress

- FS-001 — Completed
- FS-002 — Completed
- FS-003 — Completed
- FS-004 — Completed
- FS-005 — Completed
- FS-006 — Pending
- FS-007 — Pending
