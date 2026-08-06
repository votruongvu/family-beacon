---
title: "Project Charter — Family Beacon"
project_slug: "family-beacon"
artifact_type: "project-charter"
status: "draft-for-faro-intake"
version: "0.1.0"
date: "2026-08-06"
language: "English"
---

# Project Charter — Family Beacon

## 1. Project Identity

**Product name:** Family Beacon
**Repository/project slug:** `family-beacon`
**Product category:** Consent-based family location sharing and rapid assistance
**Primary platforms:** iOS and Android through Flutter
**Current phase:** Phase 1 — Minimum Viable Product

### Name rationale

1. A family member wants to know where a loved one is.
2. A family member needs help and wants others to know where they are.

---

## 2. Project North Star

> Help family members know where their loved ones are and request assistance quickly, while preserving explicit consent, personal control, and privacy.

The product must provide practical reassurance without becoming a hidden surveillance system.

Every product and technical decision must be evaluated against four questions:

1. Does this help a family member understand where a loved one is?
2. Does this help a family member ask for or respond to help?
3. Does this preserve the tracked person's awareness and control?
4. Can the capability operate reliably enough for everyday family use?

---

## 3. Problem Statement

Families often need a simple way to know whether an elderly parent, young child, or other family member is safe and where they were last located.

Existing location-sharing products may be too complex, too broad, dependent on a specific device ecosystem, or unclear about privacy and control.

The Phase 1 product will provide a focused family experience:

- passwordless phone-number authentication;
- trusted family membership;
- explicit location sharing;
- a shared family map;
- a simple SOS flow;
- push notifications and acknowledgement.

The application is not an emergency dispatch service and must not claim guaranteed delivery, guaranteed live tracking, or replacement of local emergency services.

---

## 4. Target Users

### Primary users

- Adults caring for elderly parents.
- Parents or guardians caring for young children.
- Family members who want simple mutual location sharing.
- Family members who may need to request help quickly.

### User roles

#### Family Owner

The user who creates the family.

The Family Owner may:

- name the family;
- invite members;
- cancel pending invitations;
- remove members;
- view locations shared by active family members;
- acknowledge SOS events;
- resolve an SOS when authorized by the product rules.

The Family Owner must not be able to silently enable location sharing for another member.

#### Family Member

An authenticated user who has accepted a family invitation.

A Family Member may:

- view locations shared by other active members in the same family;
- control their own location-sharing state;
- initiate an SOS;
- acknowledge an SOS;
- leave the family.

#### SOS Initiator

The member who activates an SOS event.

#### SOS Responder

A family member who acknowledges that they have seen the SOS and are responding.

---

## 5. Phase 1 Product Scope

### 5.1 Authentication

The application must support passwordless authentication using a phone number and SMS OTP.

Phase 1 authentication will use:

- Firebase Authentication;
- phone-number sign-in;
- Firebase test phone numbers for local and development environments;
- real SMS verification for pilot and production environments.

The application must not store or manage user passwords.

### 5.2 User Profile

A user must be able to maintain:

- display name;
- phone number;
- optional avatar;
- optional family relationship label.

The normalized phone number must use E.164 format for identity matching.

### 5.3 Family Management

A user must be able to:

- create a family;
- become the Family Owner;
- invite another person by phone number;
- view pending invitations;
- accept or decline an invitation;
- view active family members;
- remove or leave a family according to authorization rules.

For Phase 1, one user belongs to at most one active family.

### 5.4 Location Sharing

Each family member must explicitly control whether their location is shared.

The application must support:

- foreground location acquisition;
- background location acquisition where the operating system permits it;
- pause and resume sharing;
- latest known location;
- capture timestamp;
- server receipt timestamp;
- location accuracy;
- stale-location indication;
- unavailable-location indication;
- permission-denied indication.

The application must never present an old location as a current location.

### 5.5 Family Map

An authenticated member must be able to view the latest shared location of active members in the same family.

The map must provide:

- one marker per member with available location;
- member name and avatar or initials;
- last-updated time;
- location accuracy;
- stale or offline state;
- map centering on a selected member;
- current user location when permission is available.

Phase 1 will use Google Maps for Flutter.

### 5.6 SOS

A family member must be able to deliberately activate an SOS event.

The initial interaction rule is:

- press and hold the SOS control for approximately three seconds;
- provide a short cancellation grace period before final activation;
- attempt to obtain a fresh high-accuracy location;
- fall back to the last known location when a fresh location is unavailable;
- clearly indicate when the location is stale.

After activation, the system must:

- persist the SOS event;
- notify other active family members through Firebase Cloud Messaging;
- open the SOS detail screen from the push notification;
- allow a recipient to acknowledge the SOS;
- allow the recipient to call the initiator;
- allow the recipient to open navigation to the SOS location;
- allow an authorized user to resolve or cancel the SOS;
- show the initiator when another family member has acknowledged the event.

The system must distinguish between:

- SOS created;
- notification dispatch requested;
- SOS acknowledged by a family member;
- SOS resolved.

Push dispatch must not be represented as proof that a person has read the alert.

---

## 6. Core User Journeys

### Journey JRN-001 — Sign In

1. User enters a phone number.
2. The application normalizes the number.
3. Firebase sends or simulates an OTP.
4. User enters the OTP.
5. Firebase authenticates the user.
6. The application creates or loads the user profile.
7. The application routes the user to invitation, family setup, or family home.

### Journey JRN-002 — Create Family

1. Authenticated user has no active family.
2. User selects Create Family.
3. User enters a family name.
4. The system creates the family.
5. The user becomes Family Owner.
6. The family home is displayed.

### Journey JRN-003 — Invite Member

1. Family Owner enters a phone number.
2. The system normalizes the number.
3. The system creates a pending invitation.
4. The invited person signs in with the same phone number.
5. The invited person sees the invitation.
6. The invited person accepts or declines.
7. Acceptance creates an active family membership.

### Journey JRN-004 — Share Location

1. Member opens location-sharing settings.
2. The application explains what will be shared.
3. Member explicitly enables sharing.
4. The application requests required permissions.
5. The application collects and sends location updates.
6. Other active family members see the latest location.

### Journey JRN-005 — View Family Map

1. Member opens the Family Map.
2. The application loads active family members.
3. The application subscribes to latest-location updates.
4. The map displays available member markers.
5. The user selects a member.
6. The application displays location age, accuracy, and sharing status.

### Journey JRN-006 — Activate SOS

1. Member presses and holds SOS.
2. The application displays activation progress.
3. The application provides a cancellation grace period.
4. The application requests a fresh location.
5. The backend validates and creates the SOS event.
6. The backend dispatches FCM notifications.
7. The initiator sees an active SOS state.
8. The initiator waits for acknowledgement.

### Journey JRN-007 — Respond to SOS

1. Family member receives a push notification.
2. The member opens the SOS detail screen.
3. The member reviews the location and its timestamp.
4. The member selects "I'm responding."
5. The system records the acknowledgement.
6. The initiator sees who acknowledged.
7. The responder may call or open directions.
8. An authorized user resolves the event.

---

## 7. Functional Capability Register

### CAP-001 — Passwordless Phone Authentication

The system shall authenticate users through phone-number OTP without storing application passwords.

### CAP-002 — User Profile

The system shall maintain a minimal authenticated user profile.

### CAP-003 — Family Creation

The system shall allow an authenticated user without an active family to create one.

### CAP-004 — Family Invitation

The system shall allow the Family Owner to invite a member by normalized phone number.

### CAP-005 — Invitation Consent

The system shall require the invited user to explicitly accept membership.

### CAP-006 — Membership Authorization

The system shall ensure users can access only their active family and its authorized data.

### CAP-007 — Location-Sharing Control

The system shall allow each member to enable, pause, and resume sharing of their own location.

### CAP-008 — Latest Location

The system shall store and expose the latest authorized location for each sharing member.

### CAP-009 — Location Freshness

The system shall display location capture time, age, accuracy, and stale state.

### CAP-010 — Family Map

The system shall display authorized family member locations on Google Maps.

### CAP-011 — SOS Activation

The system shall allow a member to deliberately activate an SOS with current or last known location.

### CAP-012 — SOS Notification

The system shall notify other active family members through Firebase Cloud Messaging.

### CAP-013 — SOS Acknowledgement

The system shall allow a family member to acknowledge an active SOS.

### CAP-014 — SOS Assistance Actions

The system shall allow a responder to call the initiator and open map directions.

### CAP-015 — SOS Resolution

The system shall support authorized SOS cancellation, acknowledgement, resolution, and expiration.

---

## 8. Quality Attributes

### NFR-001 — Privacy by Design

Location sharing must be explicit, visible, reversible, and limited to active family members.

### NFR-002 — No Hidden Tracking

The product must not implement hidden sharing, secret members, remote activation of another user's tracking, or a mode that conceals active tracking from the tracked user.

### NFR-003 — Authorization

A user must only read family, location, and SOS data for a family in which they hold an active membership.

A user must only write their own location.

### NFR-004 — Location Integrity

The system must preserve both `capturedAt` and `receivedAt`.

The UI must distinguish fresh, stale, unavailable, paused, offline, and permission-denied states.

### NFR-005 — SOS Auditability

SOS activation, acknowledgement, cancellation, resolution, and expiration must be recorded as explicit state transitions.

### NFR-006 — Battery Efficiency

Background location collection must use adaptive frequency and distance thresholds rather than continuous high-frequency GPS polling.

### NFR-007 — Graceful Degradation

If fresh location cannot be obtained, the system may use the last known location only when its timestamp and stale state are clearly shown.

### NFR-008 — Accessibility

Primary flows must use readable text, large touch targets, clear status messages, and interactions suitable for elderly users.

### NFR-009 — Platform Compliance

The implementation must comply with iOS and Android requirements for location permissions, background location, notification permission, and privacy disclosure.

### NFR-010 — Observability

Authentication failures, location upload failures, SOS transition failures, notification dispatch failures, and permission-related failures must be observable without logging OTP values or unnecessarily exposing location data.

---

## 9. Security and Privacy Rules

### PRV-001 — Explicit Membership

A person must not become an active family member without authenticating the invited phone number and accepting the invitation.

### PRV-002 — Explicit Sharing

A family owner or another family member must not enable location sharing on behalf of a user.

### PRV-003 — Same-Family Read Boundary

A user may read another member's latest location only when both hold active membership in the same family and the other member has sharing enabled.

### PRV-004 — Self-Location Write Boundary

A user may write or update only their own location.

### PRV-005 — Minimal Location Retention

Phase 1 stores the latest location only and does not provide route history or location playback.

### PRV-006 — No Emergency Guarantee

The product must state that SOS depends on device connectivity, permissions, Firebase delivery, and recipient availability.

The product is not a substitute for emergency services.

### PRV-007 — Sensitive Data Protection

Phone numbers and location data must not be exposed through document identifiers, client logs, analytics payloads, or insecure deep links.

### PRV-008 — Membership Revocation

When a user leaves or is removed from a family, that family must immediately lose access to the user's future and previously exposed current-location state according to the final deletion policy.

---

## 10. Technical Direction

### Mobile

- Flutter
- Riverpod
- `go_router`
- feature-oriented modular structure

### Authentication

- Firebase Authentication
- phone-number OTP
- Firebase test phone numbers for development
- production SMS through Firebase Authentication

### Backend and Data

- Cloud Firestore
- Cloud Functions for privileged operations
- Firebase Cloud Messaging
- Firebase Crashlytics
- server-generated timestamps for authoritative state changes

### Map and Location

- Google Maps for Flutter
- platform location APIs through a replaceable Flutter location service
- initial implementation may use `geolocator`
- foreground and background strategies separated behind an abstraction

### Recommended service boundaries

```text
AuthenticationService
FamilyService
InvitationService
LocationSharingService
FamilyMapRepository
SosService
NotificationRegistrationService
```

Client code must not send FCM notifications directly.

SOS activation and other privileged state transitions must be validated server-side.

---

## 11. Initial Domain Model

### User

```text
User
- id
- normalizedPhoneNumber
- displayName
- avatarUrl?
- activeFamilyId?
- createdAt
- updatedAt
```

### Family

```text
Family
- id
- name
- ownerUserId
- createdAt
- updatedAt
```

### FamilyMembership

```text
FamilyMembership
- familyId
- userId
- role: OWNER | MEMBER
- relationship?
- status: ACTIVE | REMOVED | LEFT
- joinedAt
- updatedAt
```

### FamilyInvitation

```text
FamilyInvitation
- id
- familyId
- invitedPhoneHash
- encryptedPhoneReference
- invitedByUserId
- status: PENDING | ACCEPTED | DECLINED | CANCELLED | EXPIRED
- expiresAt
- createdAt
- updatedAt
```

### LatestLocation

```text
LatestLocation
- familyId
- userId
- latitude
- longitude
- accuracyMeters
- capturedAt
- receivedAt
- sharingStatus
- sourcePlatform
```

### SosEvent

```text
SosEvent
- id
- familyId
- initiatedByUserId
- status
- locationSnapshot
- activatedAt
- cancelledAt?
- resolvedAt?
- resolvedByUserId?
- expiresAt
```

### SosAcknowledgement

```text
SosAcknowledgement
- sosEventId
- userId
- status: SEEN | RESPONDING
- acknowledgedAt
```

### UserDevice

```text
UserDevice
- userId
- deviceId
- platform
- fcmToken
- notificationsEnabled
- lastSeenAt
- appVersion
```

---

## 12. SOS State Model

```text
ACTIVATING
    ├── CANCELLED
    └── ACTIVE
          ├── ACKNOWLEDGED
          │      └── RESOLVED
          ├── CANCELLED
          └── EXPIRED
```

Rules:

1. `ACTIVATING` represents the local cancellation grace period.
2. `ACTIVE` means the backend has accepted the event.
3. `ACKNOWLEDGED` means at least one active family member has responded.
4. `RESOLVED` means an authorized user has closed the event.
5. `CANCELLED` means the initiator or another authorized actor cancelled it.
6. `EXPIRED` means the event exceeded the configured active duration.
7. Every transition must be validated and timestamped.
8. FCM dispatch success must not change the event to `ACKNOWLEDGED`.

---

## 13. Phase 1 Non-Goals

The following capabilities are explicitly out of scope unless introduced through a reviewed change:

- hidden or covert tracking;
- route history;
- location playback;
- geofencing;
- arrival or departure alerts;
- chat;
- voice or video calling infrastructure;
- multiple concurrent families per user;
- web administration portal;
- remote microphone or camera access;
- emergency service integration;
- location prediction;
- wearable applications;
- Google Places search;
- reverse geocoding;
- continuous high-frequency tracking;
- automatic calling without explicit user action;
- direct FCM dispatch from the mobile application.

---

## 14. MVP Acceptance Criteria

The MVP is acceptable when all of the following are demonstrated on supported iOS and Android devices:

### AC-001 — Authentication

A user can sign in with a Firebase test phone number in development and a real phone number in an enabled pilot environment.

### AC-002 — Family Lifecycle

A user can create a family, invite another phone number, and the invited user can accept and join.

### AC-003 — Membership Isolation

A user cannot access another family's members, locations, invitations, devices, or SOS events.

### AC-004 — Location Consent

A user can enable and pause their own location sharing, and another user cannot enable it for them.

### AC-005 — Family Map

Active members in the same family can view each other's latest authorized location with capture time and accuracy.

### AC-006 — Stale Location

The application clearly identifies a location that exceeds the configured freshness threshold.

### AC-007 — Background Behavior

The application demonstrates a documented background location behavior on supported devices, including operating-system limitations.

### AC-008 — SOS Activation

A member can deliberately activate SOS and the backend records an active SOS event with fresh or clearly marked last-known location.

### AC-009 — SOS Push

Other active family members with registered devices receive an FCM notification under normal connected-device conditions.

### AC-010 — SOS Acknowledgement

A recipient can acknowledge the SOS and the initiator can see the acknowledgement.

### AC-011 — Assistance Actions

A recipient can call the initiator and open directions to the SOS location.

### AC-012 — SOS Closure

An authorized user can cancel or resolve the SOS and all active family clients converge on the resulting state.

### AC-013 — Security Verification

Firestore rules and Cloud Functions reject unauthorized cross-family access and unauthorized state transitions.

### AC-014 — Privacy Verification

No OTP, plaintext sensitive token, or unnecessary precise location data appears in logs or analytics.

---

## 15. Initial Decision Register

### DEC-001 — Product Name

**Decision:** Use "Family Beacon" as the product name and `family-beacon` as the technical slug.
**Status:** Accepted.

### DEC-002 — Cross-Platform Framework

**Decision:** Use Flutter for the iOS and Android application.
**Status:** Accepted for Phase 1 planning.

### DEC-003 — Authentication Provider

**Decision:** Use Firebase Phone Authentication instead of Zalo ZNS or Twilio for Phase 1.
**Status:** Accepted.

### DEC-004 — Backend Platform

**Decision:** Use Firebase services for the MVP: Authentication, Firestore, Cloud Functions, FCM, and Crashlytics.
**Status:** Accepted.

### DEC-005 — Map Provider

**Decision:** Use Google Maps for Flutter for Phase 1.
**Status:** Accepted.

### DEC-006 — Location Storage

**Decision:** Store the latest authorized location only. Do not implement route history in Phase 1.
**Status:** Accepted.

### DEC-007 — Consent Boundary

**Decision:** Location sharing must be explicitly enabled and visible to the tracked user. Hidden tracking is prohibited.
**Status:** Accepted.

### DEC-008 — SOS Scope

**Decision:** Include SOS activation, push notification, acknowledgement, calling, directions, and resolution in the MVP.
**Status:** Accepted.

### DEC-009 — Server-Side Notification Dispatch

**Decision:** SOS notifications are dispatched by trusted backend code, not directly by the Flutter client.
**Status:** Accepted.

### DEC-010 — Family Membership Model

**Decision:** A user belongs to at most one active family in Phase 1.
**Status:** Initial MVP constraint; confirm before implementation baseline.

---

## 16. Assumptions

### ASM-001

Users have access to a phone number capable of receiving Firebase-supported verification SMS in pilot or production.

### ASM-002

Family members install the application and explicitly grant required permissions.

### ASM-003

Background location frequency and reliability vary by platform, device vendor, battery optimization settings, and user permissions.

### ASM-004

FCM delivery is best-effort and must be complemented by in-app SOS state and acknowledgement.

### ASM-005

Google Maps API keys, Firebase projects, signing configuration, and billing controls will be provisioned separately for development, staging, and production.

---

## 17. Open Decisions

These items must remain open until explicitly reviewed. Faro must not silently convert them into accepted requirements.

### OD-001 — Product Name Confirmation

**Resolved.** The product name is "Family Beacon" and the technical slug is `family-beacon`. See
DEC-001, now accepted.

### OD-002 — Supported Countries

Define whether Phase 1 supports Vietnam only or multiple country codes.

### OD-003 — Child Account Model

Define whether a child uses their own authenticated phone number or a guardian-managed device/account model.

### OD-004 — SOS Retention

Define how long resolved, cancelled, and expired SOS events are retained.

### OD-005 — Member Removal Data Handling

Define whether the removed member's last-location document is deleted immediately or retained in a restricted audit form.

### OD-006 — Exact Location Freshness Thresholds

Define the thresholds for live, recent, stale, and unavailable presentation.

### OD-007 — Background Tracking Policy

Validate update intervals and distance thresholds through device testing before treating them as production requirements.

### OD-008 — SOS Activation Timing

Validate the three-second hold and cancellation grace period through usability testing, especially with elderly users.

### OD-009 — SOS Resolution Authority

Confirm whether resolution is allowed for the initiator only, the Family Owner, or any acknowledged responder.

### OD-010 — Legal and Store Disclosures

Finalize privacy policy, consent wording, child/guardian considerations, and app-store background-location disclosures before production release.

---

## 18. Faro Intake and Change-Control Instructions

This document is the initial project charter and North Star source for Faro.

Faro should classify content as follows:

- Project identity and North Star: canonical project knowledge.
- Accepted decisions: canonical decisions.
- Functional capabilities: baseline requirements.
- Quality attributes and privacy rules: cross-cutting requirements and constraints.
- Non-goals: explicit architecture and product boundaries.
- Open decisions: unresolved items that must not be inferred as accepted.
- Assumptions: reviewable planning assumptions.
- Acceptance criteria: verification obligations.

Faro must preserve the following controls:

1. Do not expand Phase 1 beyond the stated scope without an explicit change.
2. Do not reinterpret an open decision as an accepted decision.
3. Do not introduce hidden tracking, route history, geofencing, chat, emergency dispatch, or multiple-family support without impact analysis and approval.
4. Any change affecting authentication, family authorization, location consent, background tracking, SOS state transitions, or sensitive-data retention must be classified as high impact.
5. Any requirement conflict must be recorded rather than silently resolved.
6. Repository-grounded evidence must be used before declaring a capability implemented or compliant.
7. Documentation, prompts, schemas, source comments, and generated artifacts should be written in English unless explicitly requested otherwise.

---

## 19. First Implementation Baseline

The first implementation baseline should be considered complete only when it includes:

1. Flutter application bootstrap.
2. Firebase environment configuration.
3. Phone OTP authentication.
4. User profile creation.
5. Family creation.
6. Invitation creation and acceptance.
7. Membership authorization.
8. Explicit location-sharing permission flow.
9. Latest-location persistence.
10. Family Map.
11. Device token registration.
12. SOS activation.
13. Server-side FCM dispatch.
14. SOS acknowledgement.
15. Call and navigation actions.
16. SOS resolution.
17. Firestore Security Rules.
18. Cloud Function authorization checks.
19. Basic observability and privacy-safe logging.
20. Automated tests for core domain rules and authorization boundaries.

---

## 20. Success Definition

Phase 1 succeeds when a small family can install the application, authenticate by phone, create or join one family, explicitly share current location, see each other on a map, send an SOS, receive a push notification, acknowledge the alert, call the person, and navigate to their latest known location.

The product must achieve this without hidden tracking, unnecessary location history, or ambiguous SOS delivery claims.
