# Developing Family Beacon

From a fresh clone to a running application and a passing verification run.

## What you need

| Tool | Version | Why |
|---|---|---|
| Flutter | 3.44.8 | The application. Pinned in continuous integration. |
| Dart | 3.12.2 | Ships with Flutter. |
| Node.js | 22 or later | Backend functions and the tooling. Functions deploy on Node 22. |
| Java | 21 or later | The datastore emulator runs on a JVM. |
| Xcode | 26 or later | iOS builds. Minimum deployment target is iOS 15. |
| Android SDK | 36 | Android builds. |

Everything else — the Firebase command line tool included — is pinned in
`package.json` and installed by `npm ci`. There is nothing to install globally.

## First run

```sh
flutter pub get
npm ci
npm ci --prefix functions

# In one terminal: the local backend.
npm run emulators

# In another: the application.
flutter run --flavor development --dart-define=APP_ENV=development
```

The screen shows which deployment the build is talking to. In development that
reads `environment=development project=family-beacon-dev emulators=localhost`.

If you are on an **Android emulator**, it reaches your machine at a different
address:

```sh
flutter run --flavor development \
  --dart-define=APP_ENV=development \
  --dart-define=EMULATOR_HOST=10.0.2.2
```

## Environments

Three, and they never share anything. Selecting one is a build flag, never an
edit.

| Environment | Flag | Application id | Backend project |
|---|---|---|---|
| development | `--flavor development --dart-define=APP_ENV=development` | `com.familybeacon.app.dev` | `family-beacon-dev` |
| staging | `--flavor staging --dart-define=APP_ENV=staging` | `com.familybeacon.app.stg` | `family-beacon-stg` |
| production | `--flavor production --dart-define=APP_ENV=production` | `com.familybeacon.app` | `family-beacon-prod` |

The identifiers differ so all three can sit on one device at once. A staging
build can never silently replace a production one.

Two more flags exist for the awkward cases:

- `--dart-define=USE_EMULATORS=false` points a development build at the real
  development project.
- `--dart-define=EMULATOR_HOST=10.0.2.2` moves where the emulators are.

Production ignores both and never talks to an emulator.

> **The backend projects do not exist yet.** The configuration in
> `lib/app/configuration/firebase/` is a placeholder that lets the application
> start against the emulator suite. Creating the real projects and regenerating
> those files is described in the header comment of each one.

## Verification

One command runs everything:

```sh
tool/verify.sh
```

| Stage | What it proves |
|---|---|
| format | Formatting is not a review topic. |
| analyze | The analyzer is clean under a strict rule set. |
| architecture | No forbidden dependency direction exists. |
| unit tests | Domain and shared code work, with no Flutter binding and no emulator. |
| flutter tests | Widgets, mapping, and configuration work. |
| backend typecheck | The backend compiles under strict TypeScript. |
| backend tests | The authorization helper behaves. |
| security rules | The rules reject unauthenticated and cross-boundary access. |
| callables | The deployed handlers answer, and refuse an anonymous caller. |

`tool/verify.sh --fast` skips the last two, which start an emulator suite of
their own. Use it while iterating; run the whole thing before pushing.

Continuous integration runs the same stages, so a green run here is a green run
there.

### The end-to-end test

One test runs the whole path on a real device. It needs the emulator suite
running and is not part of `verify.sh`, because it needs a device:

```sh
npm run emulators        # in another terminal
flutter test integration_test/backend_round_trip_test.dart \
  -d <device-id> --flavor development --dart-define=APP_ENV=development
```

`flutter devices` lists the identifiers.

## How the code is arranged

```text
lib/
├── app/          wiring: bootstrap, configuration, routing, platform adapters
├── shared/       framework-aware, feature-agnostic: providers features resolve
├── core/         pure Dart: failures, results, logging, time, location contract
└── features/     one directory per product capability, three layers each
```

Dependencies point inward, and `dart run tool/check_architecture.dart` enforces
it rather than trusting review:

- `core` is pure Dart. No Flutter, no SDK, no platform. It depends on nothing
  above it.
- `shared` knows the framework and no feature. It exists so a feature can
  resolve the clock or the logger without importing the application that
  composes it.
- `features/<name>/domain` is pure Dart. Contracts live here; implementations
  live in `data`; nothing infrastructure-shaped crosses out of `data`.
- `features` never import `app`, and never import another feature's `data`.

`lib/features/README.md` has the rules a new feature has to follow.

## Things worth knowing

**Where infrastructure is allowed.** Firebase, Google Maps, and the location
plugin may be imported from `lib/app`, from a feature's `data` layer, and from a
feature's `presentation` layer. Nowhere else. The check will tell you, with the
file and line, if that slips.

**Failures are returned, not thrown.** An operation that can fail returns
`Result<T>`, and a data implementation converts every infrastructure exception
into a typed `Failure` before it travels inward.

**Nothing sensitive reaches a log.** The logging API takes a closed set of
fields and `HashedId`, so a phone number, a coordinate, or a token has no path
into a log line through it.

**The diagnostics screen** at `/diagnostics` writes a probe and reads it back.
It is the Foundation's proof that the layers connect, not a product feature, and
it will be removed once real capabilities exist.
