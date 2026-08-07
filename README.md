# Family Beacon

Consent-based family location sharing and rapid assistance, for iOS and Android.

Family Beacon helps family members know where their loved ones are and ask for
or offer help quickly, without any of it happening behind someone's back.

The product direction is the Project Charter at
[`.faro/charter/current.md`](.faro/charter/current.md). The technical contract
this repository is built against is
[`ENG-FND-0001`](.faro/foundations/engineering/ENG-FND-0001/foundation.md).

## Status

The technical baseline exists. **No product capability is implemented yet** —
authentication, families, invitations, location sharing, the map, and assistance
requests are all still to come, each as its own Requirement.

What is in place: a Flutter application for iOS and Android across three
isolated environments, a layered architecture with an automated check enforcing
its dependency rules, a trusted backend with deny-by-default access rules, a
local emulator suite, and a verification command that continuous integration
runs on every push.

## Getting started

```sh
flutter pub get
npm ci && npm ci --prefix functions

npm run emulators    # in one terminal
flutter run --flavor development --dart-define=APP_ENV=development
```

Then run the checks:

```sh
tool/verify.sh
```

[`docs/development.md`](docs/development.md) covers the rest — environments,
each verification stage, the end-to-end test, and the rules a new feature has to
follow.

## Layout

```text
lib/app/          wiring: bootstrap, configuration, routing, platform adapters
lib/shared/       framework-aware, feature-agnostic providers
lib/core/         pure Dart: failures, results, logging, time, location contract
lib/features/     one directory per product capability, three layers each
functions/        trusted backend, TypeScript on Node 22
test/unit/        pure Dart — no Flutter binding, no emulator
test/flutter/     needs the Flutter toolchain
test/rules/       security rules, against the emulator
test/functions/   callables, against the emulator
integration_test/ the whole path, on a device
```

Dependencies point inward, and `dart run tool/check_architecture.dart` fails the
build when they do not.
