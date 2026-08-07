# Features

One directory per product capability. A feature owns its three layers and
nothing outside them.

```text
features/<feature>/
├── presentation/     pages, widgets, providers, view state
├── domain/           entities, value objects, contracts, use cases, policies
└── data/             data sources, transfer objects, mappers, implementations
```

## The rules a feature has to follow

Dependencies point inward. `presentation` depends on `domain`. `data` depends on
`domain`. `domain` depends on neither, and on no framework.

A `domain` layer is pure Dart. It may import the shared core, another feature's
`domain`, and the small set of pure Dart packages the architecture check allows.
It may not import Flutter, an SDK, or anything from `lib/app`.

Infrastructure stops at the `data` boundary. A Firestore document, a location
plugin position, or a map coordinate is mapped into a domain type by named
mapper code and never travels further.

One feature does not import another feature's `data`. When two features need the
same concept, promote it to a domain contract instead of coupling through an
implementation.

A feature does not import `lib/app`. The application layer wires features
together; a feature does not reach back into it.

`dart run tool/check_architecture.dart` enforces all of this, and runs on every
push.

## Adding one

Create `features/<feature>/` with the three layers, put the contracts in
`domain/repositories/`, implement them in `data/repositories/`, and resolve them
through a provider in `presentation/providers/`. No new pattern is needed — if a
feature seems to need one, that is a question for the Engineering Foundation
rather than a decision to take inside the feature.
