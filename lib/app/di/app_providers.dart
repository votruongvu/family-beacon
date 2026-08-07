/// The composition root.
///
/// Every dependency a feature needs is resolved from here or from the shared
/// layer, so a widget never constructs infrastructure for itself and a test can
/// replace any part of it by overriding one provider.
///
/// What lives here is application-wide state that features do not resolve for
/// themselves: which environment this build targets, and whether anyone is
/// signed in. Dependencies features do resolve — the clock, the logger — live
/// in the shared layer instead, so that a feature never has to import the
/// application that composes it.
///
/// Providers resolve dependencies, invoke use cases, and expose asynchronous
/// state. They are not where business rules live — those belong to domain
/// entities, value objects, policies, and use cases.
library;

import 'package:family_beacon/app/configuration/app_config.dart';
import 'package:family_beacon/app/router/access_state.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// What this build is pointing at.
///
/// Overridden at startup with the configuration bootstrap resolved, and in
/// tests with whatever the test needs. It throws if read without being
/// overridden, because silently inventing a configuration would mean silently
/// choosing an environment.
final Provider<AppConfig> appConfigProvider = Provider<AppConfig>(
  (ref) => throw UnimplementedError(
    'appConfigProvider must be overridden at startup with the resolved AppConfig',
  ),
);

/// Whether someone is signed in, as far as the shell is concerned.
///
/// The Engineering Foundation supplies the mechanism and a default of
/// [AccessState.signedOut]. The authentication Requirement overrides this
/// provider with one backed by real authentication state, and nothing about the
/// router or the guard has to change when it does.
final Provider<AccessState> accessStateProvider = Provider<AccessState>(
  (ref) => AccessState.signedOut,
);
