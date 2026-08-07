---
title: "Family Beacon — Technical Foundation"
project: "Family Beacon"
project_slug: "family-beacon"
artifact_type: "technical-foundation"
status: "accepted-baseline"
version: "0.1.0"
date: "2026-08-07"
language: "English"
---

# Family Beacon — Technical Foundation

## 1. Purpose

This document defines the technical foundation for the Family Beacon Phase 1 implementation.

It establishes the architectural style, platform choices, dependency rules, infrastructure boundaries, development environment, security principles, and technical constraints that all implementation work must follow.

This document is intentionally separate from the Product Charter.

The Product Charter defines **what the product must achieve**.

This Technical Foundation defines **how the software must be structurally built and constrained**.

Faro should treat this document as canonical technical knowledge and as an architectural constraint source when classifying requirements, evaluating changes, determining impact, and routing implementation work.

## 2. Technical North Star

> Build a small, reliable, privacy-conscious family location application whose business rules remain independent from Flutter, Firebase, Google Maps, device SDKs, and other infrastructure technologies.

The architecture must optimize for:

1. Clear business boundaries.
2. Replaceable external providers.
3. Testable domain logic.
4. Minimal infrastructure for the MVP.
5. Strong authorization and privacy controls.
6. Explicit handling of mobile platform limitations.
7. Low operational complexity.
8. Controlled evolution after Phase 1.

## 3. Technology Baseline

| Area | Decision |
|---|---|
| Mobile Framework | Flutter |
| Primary Language | Dart |
| Target Platforms | iOS and Android |
| Application Architecture | Clean Architecture |
| Module Strategy | Feature-first modularization |
| State Management | Riverpod |
| Navigation | `go_router` |
| Backend Platform | Firebase |
| Authentication | Firebase Authentication — Phone Number + SMS OTP |
| Database | Cloud Firestore |
| Privileged Backend Logic | Cloud Functions for Firebase |
| Push Notification | Firebase Cloud Messaging |
| Map Provider | Google Maps |
| Location Capability | Native iOS/Android location services through a Flutter abstraction |
| Initial Location Adapter | `geolocator` |
| Local Notifications | `flutter_local_notifications` |
| Crash Reporting | Firebase Crashlytics |
| Application Attestation | Firebase App Check |
| Local Backend Development | Firebase Local Emulator Suite |
| Package Management | Dart Pub |
| Test Foundation | Flutter unit, widget, integration, and architecture tests |
| Environment Model | Development, Staging, Production |
| Source Control | Git |
| CI/CD Provider | Open technical decision |

Exact Flutter, Dart, Firebase plugin, and supporting package versions are intentionally not fixed in this document. They must be selected and recorded during repository bootstrap using versions verified as compatible at implementation time.

## 4. Architectural Style

### 4.1 Clean Architecture Is Mandatory

The Flutter application SHALL follow Clean Architecture.

This is a hard architectural constraint, not a recommendation.

Each business feature SHALL isolate:

- Presentation
- Domain
- Data

The central dependency rule is:

```text
Presentation ──────► Domain
Data / Infra ──────► Domain

Domain ────────────► No framework or infrastructure dependency
```

Dependencies must point inward.

The Domain layer must remain independent from:

- Flutter;
- Firebase;
- Firestore;
- Cloud Functions;
- Firebase Authentication;
- Firebase Cloud Messaging;
- Google Maps;
- `geolocator`;
- platform-specific iOS APIs;
- platform-specific Android APIs;
- persistence SDKs;
- transport SDKs;
- UI frameworks.

## 5. Module Strategy

### 5.1 Feature-First Organization

The source tree SHALL be organized primarily by product capability rather than by technical layer across the entire application.

Expected top-level structure:

```text
lib/
├── app/
│   ├── bootstrap/
│   ├── router/
│   ├── configuration/
│   └── app.dart
│
├── core/
│   ├── error/
│   ├── result/
│   ├── security/
│   ├── permissions/
│   ├── logging/
│   ├── time/
│   └── shared/
│
└── features/
    ├── authentication/
    ├── profile/
    ├── family/
    ├── invitations/
    ├── location_sharing/
    ├── family_map/
    └── sos/
```

Each feature SHALL contain Clean Architecture layers:

```text
features/<feature>/
├── presentation/
├── domain/
└── data/
```

Example:

```text
features/sos/
├── presentation/
│   ├── pages/
│   ├── widgets/
│   ├── providers/
│   └── state/
│
├── domain/
│   ├── entities/
│   ├── value_objects/
│   ├── repositories/
│   ├── usecases/
│   └── failures/
│
└── data/
    ├── datasources/
    ├── dto/
    ├── mappers/
    └── repositories/
```

## 6. Layer Responsibilities

### 6.1 Presentation Layer

The Presentation layer is responsible for:

- Flutter pages and widgets;
- navigation interaction;
- presentation state;
- Riverpod providers;
- user input;
- UI validation;
- display formatting;
- invoking domain use cases;
- translating domain state into UI state.

The Presentation layer SHALL NOT contain core business rules.

Examples of rules that do not belong in Presentation:

- whether a family member may access another member's location;
- whether an SOS state transition is valid;
- whether an invitation may be accepted;
- whether an old location should be considered stale at the domain level;
- whether a user may belong to another active family.

UI-specific logic may remain in Presentation.

### 6.2 Domain Layer

The Domain layer contains business concepts and rules.

Expected content:

```text
domain/
├── entities/
├── value_objects/
├── repositories/
├── usecases/
├── policies/
└── failures/
```

Typical domain entities include:

```text
User
Family
FamilyMembership
FamilyInvitation
LatestLocation
SosEvent
SosAcknowledgement
```

Typical domain value objects include:

```text
UserId
FamilyId
PhoneNumber
Latitude
Longitude
LocationAccuracy
LocationTimestamp
SosId
```

Typical domain contracts include:

```text
AuthenticationRepository
FamilyRepository
InvitationRepository
LocationRepository
SosRepository
DeviceRegistrationRepository
```

The Domain layer SHALL:

- be pure Dart whenever reasonably possible;
- contain no Firebase models;
- contain no Firestore document snapshots;
- contain no Google Maps objects;
- contain no plugin DTOs;
- contain no platform channel objects;
- be independently unit-testable.

### 6.3 Data Layer

The Data layer implements interfaces defined by the Domain layer.

Responsibilities include:

- Firebase integration;
- Firestore reads and writes;
- Firebase Authentication access;
- Cloud Functions calls;
- FCM device-token registration;
- native location plugin interaction;
- DTO serialization;
- mapping DTOs to domain entities;
- infrastructure error translation;
- caching where explicitly required.

Example:

```text
Domain:
SosRepository

Implementation:
FirebaseSosRepository
```

```text
Domain:
LocationRepository

Implementation:
GeolocatorLocationRepository
```

External SDK objects SHALL NOT leak beyond the Data layer boundary.

## 7. Dependency Rules

The following rules are mandatory.

### AR-001 — Domain Independence

Domain code must not import Flutter or infrastructure SDKs.

### AR-002 — Infrastructure Behind Contracts

External systems must be accessed through contracts owned by the Domain layer or through narrowly scoped application abstractions where appropriate.

### AR-003 — No Firebase Types in Domain

Firestore document types, Firebase user objects, Cloud Functions response types, and FCM types must not appear in domain APIs.

### AR-004 — No Google Maps Types in Domain

Map markers, camera objects, coordinate classes, and Google Maps SDK types must not enter domain models.

### AR-005 — No Location Plugin Types in Domain

`Position`, permission enums, plugin-specific location types, and platform-specific objects must be mapped before entering the Domain layer.

### AR-006 — No Cross-Feature Data-Layer Coupling

One feature's Data layer should not directly depend on another feature's Data implementation.

Shared domain concepts must be promoted intentionally rather than coupled through implementation shortcuts.

### AR-007 — Explicit Mapping Boundaries

Infrastructure DTOs must be mapped to domain entities through explicit mapper code.

## 8. State Management

Riverpod SHALL be used for presentation and application-state orchestration.

Riverpod is not the business-rule engine.

Providers should primarily:

- resolve dependencies;
- invoke use cases;
- expose asynchronous state;
- coordinate view state;
- react to domain events or repository streams.

Business rules must remain inside Domain services, policies, entities, value objects, or use cases.

Example:

```text
SOS Page
   ↓
SosController / Provider
   ↓
ActivateSosUseCase
   ↓
SosRepository
   ↓
FirebaseSosRepository
```

## 9. Navigation

`go_router` SHALL be used as the initial navigation solution.

Navigation definitions belong to the application/presentation boundary.

Initial logical routes may include:

```text
/auth/phone
/auth/otp
/profile/setup
/family/create
/family/invitation
/family/members
/map
/sos/:sosEventId
/profile
```

Route guards must use authenticated application state and family membership state.

Navigation must not become the source of authorization truth.

Backend authorization remains authoritative.

## 10. Firebase-First MVP Principle

Family Beacon SHALL use Firebase-managed capabilities when they reasonably satisfy Phase 1 requirements.

Phase 1 should prefer managed capabilities over custom infrastructure.

Initial Firebase services:

```text
Firebase Authentication
Cloud Firestore
Cloud Functions for Firebase
Firebase Cloud Messaging
Firebase App Check
Firebase Crashlytics
Firebase Local Emulator Suite
```

Optional capabilities that are not automatically part of the baseline:

```text
Firebase Analytics
Cloud Storage for Firebase
Remote Config
Performance Monitoring
```

Optional services require a separate requirement or decision before adoption.

## 11. Authentication Foundation

Authentication SHALL use Firebase Authentication with phone-number verification.

Phase 1 authentication characteristics:

- passwordless;
- phone-number identity;
- SMS OTP;
- Firebase test phone numbers for development;
- real Firebase SMS verification for pilot and production;
- authenticated Firebase UID as the backend principal.

Application code SHALL not:

- manage user passwords;
- store OTP plaintext;
- log OTP codes;
- create a parallel authentication identity when Firebase UID is sufficient.

Phone numbers used for matching invitations SHALL be normalized to E.164 format.

Authentication proves identity.

It does not by itself grant family-data access.

Family authorization must be evaluated separately.

## 12. Authorization Foundation

Authorization is enforced through multiple layers:

```text
Firebase Authentication
        ↓
Firestore Security Rules
        ↓
Cloud Function authorization
        ↓
Domain policy
```

Client-side checks improve UX but are not security boundaries.

Critical authorization invariants include:

1. A user accesses only an active family to which the user belongs.
2. A user may write only their own location.
3. A user may not silently activate location sharing for another person.
4. A user may not acknowledge an SOS as another user.
5. Cross-family reads must fail closed.
6. Privileged state transitions must be validated server-side.

## 13. Firestore Foundation

Cloud Firestore SHALL provide the primary application data store for Phase 1.

Logical aggregates include:

```text
users
families
family_memberships
family_invitations
latest_locations
sos_events
sos_acknowledgements
user_devices
```

The exact physical collection layout is intentionally not fixed by this document.

The final schema SHALL be determined through repository-grounded design and documented as an explicit technical decision.

Firestore responsibilities include:

- current application state;
- family membership;
- invitations;
- latest member location;
- SOS state;
- acknowledgement state;
- registered mobile devices.

Firestore SHALL NOT become a permanent location-history store in Phase 1.

## 14. Server-Authoritative Operations

Operations with elevated trust or cross-user side effects SHALL execute through trusted backend code.

Initial candidates include:

```text
createFamily
inviteFamilyMember
acceptFamilyInvitation
removeFamilyMember
activateSos
acknowledgeSos
resolveSos
cancelSos
dispatchSosNotifications
```

Whether every operation requires a callable Cloud Function or can be safely implemented with Firestore Security Rules is an implementation decision.

However, the following are mandatory server-side responsibilities:

- FCM dispatch;
- trusted SOS lifecycle validation where client ownership alone is insufficient;
- operations requiring privileged Firestore access;
- operations affecting multiple users where consistency or authorization cannot be safely enforced client-side.

The Flutter application SHALL NOT contain server credentials or directly dispatch arbitrary FCM messages.

## 15. Location Foundation

Location collection must be isolated behind an application-owned abstraction.

Example contract:

```dart
abstract interface class LocationRepository {
  Future<LocationSnapshot> getCurrentLocation();
  Stream<LocationSnapshot> watchLocation();
}
```

An initial adapter may use:

```text
geolocator
```

The architecture must permit replacing the adapter without changing domain logic.

Location handling must preserve at minimum:

```text
latitude
longitude
accuracy
capturedAt
receivedAt
```

The system must distinguish:

```text
fresh
recent
stale
unavailable
sharing paused
permission denied
device offline
```

Location collection must not assume continuous GPS availability.

## 16. Background Location Principle

Background location is a platform capability with operational constraints, not a guaranteed continuous service.

The implementation must account for:

- iOS permission rules;
- Android permission rules;
- background execution limits;
- device-vendor battery optimization;
- application termination;
- user-disabled permissions;
- network availability;
- battery impact.

The application must not promise continuous real-time tracking.

The product semantics are:

> Latest authorized known location with clearly represented freshness.

Exact background frequency and distance thresholds remain open until validated on physical devices.

## 17. Realtime Principle

Family Beacon uses realtime synchronization of application state.

It does not imply continuous realtime GPS acquisition.

```text
Firestore realtime listener
            ≠
continuous location sensor polling
```

Firestore listeners may update Family Map state immediately when a new authorized location is written.

The device location strategy must remain adaptive and battery-conscious.

## 18. Map Foundation

Google Maps SHALL be the Phase 1 map provider.

The Flutter Google Maps SDK belongs to Presentation/Data infrastructure boundaries.

Domain code must work with application-owned coordinates and location models.

Example:

```text
Domain:
GeoPoint(latitude, longitude)

Presentation:
GeoPoint
   ↓ mapper
LatLng
   ↓
Google Maps
```

This boundary preserves the option to change map providers in the future.

Provider replacement is not part of Phase 1.

## 19. Push Notification Foundation

Firebase Cloud Messaging SHALL provide remote push notification delivery.

Phase 1 use cases include:

- SOS notification;
- potentially selected family operational notifications if later approved.

Device tokens SHALL be treated as infrastructure data.

A user may have multiple registered devices.

Recommended logical model:

```text
User
  └── Devices
       ├── Device A
       └── Device B
```

FCM dispatch does not prove notification delivery or user acknowledgement.

SOS acknowledgement must be a separate business event.

## 20. SOS Technical Foundation

SOS is a first-class domain capability.

It must not be modeled as a generic boolean flag.

Initial logical state model:

```text
ACTIVATING
    ├── CANCELLED
    └── ACTIVE
          ├── ACKNOWLEDGED
          │      └── RESOLVED
          ├── CANCELLED
          └── EXPIRED
```

The final state model may evolve through an approved requirement or decision.

Important invariants:

1. Every SOS belongs to one family.
2. Every SOS has one authenticated initiator.
3. Activation attempts to attach a fresh location.
4. Last-known location may be used only with explicit freshness metadata.
5. Notification dispatch does not equal acknowledgement.
6. Acknowledgement identifies the responding family member.
7. Invalid state transitions must fail closed.
8. Important state transitions must be timestamped.

## 21. Privacy as an Architectural Boundary

Privacy is not only a product requirement.

It is an architecture constraint.

The system SHALL preserve:

```text
User controls own location sharing.
Family controls membership.
Backend enforces authorization.
No component silently enables tracking for another user.
```

Phase 1 explicitly prohibits:

- hidden tracking;
- silent tracking activation;
- secret family members;
- covert location history;
- remote microphone access;
- remote camera access;
- stealth background operation designed to evade user awareness.

## 22. Sensitive Data Handling

Sensitive information includes:

- phone numbers;
- precise location;
- FCM device tokens;
- authentication identifiers;
- SOS event locations.

Rules:

1. Do not place sensitive values unnecessarily in logs.
2. Do not use plaintext phone numbers as public document identifiers.
3. Do not include precise location in analytics events unless explicitly justified and approved.
4. Do not log authentication tokens.
5. Do not embed privileged credentials in Flutter application binaries.
6. Use platform-appropriate secure configuration for secrets and credentials.
7. API keys must be restricted according to provider capabilities.

## 23. Firebase App Check

Firebase App Check SHALL be part of the security foundation.

The objective is to reduce unauthorized access from non-genuine clients.

App Check complements but does not replace:

- authentication;
- Firestore Security Rules;
- backend authorization;
- domain validation.

Development and emulator configuration must permit controlled local testing without weakening production enforcement.

## 24. Observability

Firebase Crashlytics SHALL provide the initial mobile crash-reporting baseline.

Application logging must support diagnosis of:

- authentication failure;
- invitation failure;
- authorization rejection;
- location-permission failure;
- location acquisition failure;
- location-upload failure;
- SOS activation failure;
- SOS transition failure;
- FCM token registration failure;
- backend notification-dispatch failure.

Logging must avoid exposing sensitive payloads.

Recommended structured context:

```text
operation
feature
result
errorCode
userIdHash?
familyIdHash?
platform
appVersion
```

Precise location should not be logged by default.

## 25. Error Model

Infrastructure exceptions SHALL NOT be propagated directly into Presentation.

Expected flow:

```text
FirebaseException
      ↓
Data Layer Mapping
      ↓
Domain/Application Failure
      ↓
Presentation State
      ↓
User-Friendly Message
```

Example domain failures:

```text
AuthenticationFailure
PermissionDeniedFailure
FamilyAuthorizationFailure
InvitationExpiredFailure
LocationUnavailableFailure
LocationPermissionFailure
SosActivationFailure
SosInvalidTransitionFailure
NetworkUnavailableFailure
```

## 26. Environment Strategy

Family Beacon SHALL maintain isolated environments:

```text
development
staging
production
```

Each environment should have separate Firebase configuration.

Recommended mapping:

```text
family-beacon-dev
family-beacon-stg
family-beacon-prod
```

Actual project identifiers may differ depending on Firebase availability and naming rules.

Environment-specific resources include:

- Firebase project;
- API keys;
- Google Maps credentials;
- Firestore;
- Cloud Functions;
- FCM configuration;
- App Check configuration.

Production data SHALL NOT be used as the default development environment.

## 27. Local Development

Firebase Local Emulator Suite SHALL be used where supported for local development and automated verification.

Target local capabilities include:

```text
Authentication Emulator
Firestore Emulator
Functions Emulator
```

Firebase test phone numbers should be used for phone-auth development where appropriate.

Local development must minimize accidental:

- production SMS usage;
- production Firestore writes;
- production Cloud Function calls;
- production notification dispatch.

## 28. Configuration and Secrets

Configuration SHALL be environment-aware.

No production secret may be committed to source control.

Flutter application configuration must distinguish between:

```text
public client configuration
restricted API credentials
server-side secrets
```

Server-side secrets belong in backend secret-management mechanisms and must not be bundled in the Flutter application.

Google Maps keys SHALL use platform and API restrictions.

## 29. Testing Foundation

Testing must follow the architecture.

### 29.1 Domain Tests

Domain entities, policies, value objects, and use cases must be tested independently from Flutter and Firebase.

Examples:

- family membership rules;
- invitation acceptance;
- SOS state transitions;
- location freshness evaluation;
- permission-independent domain decisions.

### 29.2 Repository Contract Tests

Repository implementations should be tested against expected domain contracts.

### 29.3 Widget Tests

Important presentation states should have Flutter widget tests.

### 29.4 Integration Tests

Critical end-to-end flows should be validated on supported platform configurations.

Priority flows:

```text
Phone Login
Create Family
Invite Member
Accept Invitation
Enable Location
Family Map
Activate SOS
Receive SOS
Acknowledge SOS
Resolve SOS
```

### 29.5 Security Tests

Firestore Security Rules and trusted backend authorization must have automated tests covering:

- cross-family reads;
- cross-family writes;
- unauthorized location writes;
- invitation misuse;
- unauthorized SOS mutation.

### 29.6 Architecture Tests

The repository should include automated or static verification where practical to detect forbidden dependencies such as:

```text
domain → firebase
domain → flutter
domain → google_maps_flutter
domain → geolocator
```

## 30. CI/CD Foundation

The CI/CD provider remains open.

Regardless of provider, the pipeline should support:

```text
format
static analysis
unit tests
widget tests
architecture checks
Firebase rule tests
backend tests
build validation
```

Release signing, distribution, and deployment strategy will be introduced through explicit technical decisions.

## 31. Coding Principles

### CP-001 — Explicit Over Implicit

Authorization, state transitions, mappings, and provider boundaries should be visible in code.

### CP-002 — Small Domain Interfaces

Repositories and services should expose minimal operations aligned with business behavior.

### CP-003 — Avoid Generic God Services

Do not create broad services such as:

```text
FirebaseService
AppService
CommonService
DataManager
```

Prefer capability-specific interfaces.

### CP-004 — Immutable Domain Models

Domain entities and value objects should be immutable where practical.

### CP-005 — Typed Failures

Expected business and infrastructure failures should be represented explicitly.

### CP-006 — Provider Isolation

Provider-specific behavior belongs at the infrastructure boundary.

### CP-007 — No Premature Generalization

Build for Phase 1 requirements.

Do not introduce generic plugin systems, microservices, event buses, or abstraction layers without a concrete requirement.

## 32. Initial Architectural Decisions

### DEC-TF-001 — Flutter

**Decision:** Use Flutter for the iOS and Android application.  
**Status:** Accepted.

### DEC-TF-002 — Clean Architecture

**Decision:** The Flutter application SHALL follow Clean Architecture.  
**Status:** Accepted.

### DEC-TF-003 — Feature-First Structure

**Decision:** Organize the application by feature, with Presentation, Domain, and Data layers inside each feature.  
**Status:** Accepted.

### DEC-TF-004 — Domain Independence

**Decision:** Domain code SHALL remain independent from Flutter, Firebase, Google Maps, location SDKs, and platform infrastructure.  
**Status:** Accepted.

### DEC-TF-005 — Riverpod

**Decision:** Use Riverpod for presentation/application-state orchestration and dependency resolution.  
**Status:** Accepted.

### DEC-TF-006 — go_router

**Decision:** Use `go_router` for Phase 1 navigation.  
**Status:** Accepted.

### DEC-TF-007 — Firebase Backend

**Decision:** Use Firebase as the managed backend foundation for Phase 1.  
**Status:** Accepted.

### DEC-TF-008 — Firebase Phone Authentication

**Decision:** Use Firebase Authentication with phone-number SMS OTP.  
**Status:** Accepted.

### DEC-TF-009 — Cloud Firestore

**Decision:** Use Cloud Firestore as the primary Phase 1 application data store.  
**Status:** Accepted.

### DEC-TF-010 — Cloud Functions

**Decision:** Use Cloud Functions for trusted backend operations requiring privileged authorization or server-side execution.  
**Status:** Accepted.

### DEC-TF-011 — Firebase Cloud Messaging

**Decision:** Use Firebase Cloud Messaging for SOS push notifications.  
**Status:** Accepted.

### DEC-TF-012 — Google Maps

**Decision:** Use Google Maps for Flutter as the Phase 1 map provider.  
**Status:** Accepted.

### DEC-TF-013 — Location Abstraction

**Decision:** Access device location through an application-owned abstraction. Initial implementation may use `geolocator`.  
**Status:** Accepted.

### DEC-TF-014 — Latest Location Semantics

**Decision:** Phase 1 focuses on latest authorized known location rather than route history or continuous realtime GPS semantics.  
**Status:** Accepted.

### DEC-TF-015 — Firebase App Check

**Decision:** Include Firebase App Check as part of the production security foundation.  
**Status:** Accepted.

### DEC-TF-016 — Environment Isolation

**Decision:** Maintain separate Development, Staging, and Production environments.  
**Status:** Accepted.

## 33. Open Technical Decisions

Faro must keep the following unresolved until repository evidence or explicit review resolves them.

### OTD-001 — Flutter SDK Version
Select the exact Flutter version during repository bootstrap.

### OTD-002 — Dart SDK Version
Select the exact Dart version compatible with the chosen Flutter baseline.

### OTD-003 — Package Versions
Select exact package versions after compatibility verification.

### OTD-004 — Cloud Functions Runtime
Choose the Cloud Functions runtime and implementation language.

### OTD-005 — Firestore Physical Schema
Define the exact collection and document structure.

### OTD-006 — Background Location Implementation
Validate the appropriate implementation strategy on physical iOS and Android devices.

### OTD-007 — Location Update Policy
Determine production location frequency and distance thresholds through device and battery testing.

### OTD-008 — CI/CD Provider
Select the CI/CD platform.

### OTD-009 — Mobile Distribution
Define development, staging, TestFlight, Play testing, and production distribution workflows.

### OTD-010 — Analytics
Decide whether Firebase Analytics is required.

### OTD-011 — Media Storage
Decide whether Cloud Storage is required for user avatars.

### OTD-012 — SOS Retention
Define retention rules for resolved, cancelled, and expired SOS records.

## 34. Explicit Technical Non-Goals

The following are not part of the Phase 1 technical foundation:

- microservices architecture;
- Kubernetes;
- custom authentication server;
- custom OTP infrastructure;
- custom push-notification server;
- custom map rendering engine;
- custom realtime socket infrastructure;
- general event-sourcing platform;
- Kafka or distributed event streaming;
- route-history storage;
- geospatial data warehouse;
- generic plugin framework;
- multiple backend providers;
- multi-region active-active architecture;
- premature offline-first synchronization engine;
- hidden background services designed to bypass platform policies.

These may only be introduced through an explicit requirement, impact analysis, and accepted decision.

## 35. Architectural Verification Gates

A change must fail architectural verification if it introduces any of the following without an accepted decision:

1. Flutter or Firebase imports inside Domain.
2. Business logic directly embedded in widgets.
3. Firestore models exposed to Domain.
4. Google Maps types exposed to Domain.
5. `geolocator` types exposed to Domain.
6. Direct FCM dispatch from the mobile client.
7. Cross-family data access without an authorization boundary.
8. Location history persistence in Phase 1.
9. Silent activation of another user's location sharing.
10. New infrastructure introduced without a requirement.
11. Provider credentials committed to source control.
12. Production services used by default in automated local tests.

## 36. Faro Interpretation Rules

Faro SHALL classify this document as canonical Technical Foundation.

Faro should interpret:

- accepted decisions as architecture constraints;
- dependency rules as mandatory invariants;
- open technical decisions as unresolved;
- technical non-goals as explicit scope boundaries;
- verification gates as implementation and review obligations.

Faro must not silently resolve an Open Technical Decision.

Faro must perform delta-impact analysis when a new requirement changes:

- Clean Architecture boundaries;
- domain independence;
- authentication;
- authorization;
- Firestore data ownership;
- location collection;
- background execution;
- SOS lifecycle;
- notification delivery;
- sensitive-data handling;
- environment isolation.

Repository-grounded evidence must be used before Faro declares an architectural requirement implemented or compliant.

## 37. Definition of Technical Foundation Compliance

An implementation is compliant with this Technical Foundation when:

1. Flutter is used for iOS and Android.
2. The application follows feature-first Clean Architecture.
3. Domain has no dependency on Flutter or infrastructure SDKs.
4. Firebase and device SDKs are isolated in outer layers.
5. Riverpod orchestrates state without becoming the business-rule layer.
6. Authorization is enforced server-side and through Firestore Security Rules where appropriate.
7. Location sharing remains explicit and user-controlled.
8. Latest-location semantics are preserved.
9. SOS is implemented as an explicit lifecycle.
10. FCM notification dispatch occurs through trusted backend code.
11. Development, staging, and production environments remain isolated.
12. Sensitive data is handled according to the defined boundaries.
13. Core business rules are independently testable.
14. Architecture and security boundaries have automated verification where practical.
15. No Phase 1 technical non-goal is introduced without an accepted change.
