/// The configuration one build runs with.
library;

import 'package:family_beacon/app/configuration/app_environment.dart';

/// Where the local emulator suite is listening.
///
/// The host is configurable because an Android emulator reaches the developer's
/// machine at a different address than an iOS simulator does.
final class EmulatorEndpoints {
  /// Creates an emulator endpoint set.
  const EmulatorEndpoints({
    this.host = 'localhost',
    this.authPort = 9099,
    this.firestorePort = 8080,
    this.functionsPort = 5001,
  });

  /// The host the emulator suite is bound to.
  final String host;

  /// The authentication emulator port.
  final int authPort;

  /// The datastore emulator port.
  final int firestorePort;

  /// The functions emulator port.
  final int functionsPort;
}

/// Everything a build needs to know about where it is pointing.
final class AppConfig {
  /// Creates a configuration.
  const AppConfig({
    required this.environment,
    required this.useEmulators,
    this.emulators = const EmulatorEndpoints(),
  });

  /// Reads the configuration this build was compiled with.
  factory AppConfig.fromBuild() => AppConfig.forEnvironment(
    AppEnvironment.current(),
    useEmulatorsOverride: _hasUseEmulatorsOverride
        ? _useEmulatorsOverride
        : null,
    emulatorHost: _emulatorHost,
  );

  /// Resolves the configuration for [environment].
  ///
  /// Emulator use is a separate flag from the environment, because a developer
  /// occasionally needs to point a development build at the real development
  /// project. It defaults to on for development, off elsewhere, and is refused
  /// outright for production whatever the flag says.
  ///
  /// The policy lives here, taking its inputs as arguments, so it can be tested
  /// directly rather than only through whatever the compiler happened to bake
  /// into this build.
  factory AppConfig.forEnvironment(
    AppEnvironment environment, {
    bool? useEmulatorsOverride,
    String emulatorHost = 'localhost',
  }) {
    // This is the pair of mistakes worth making impossible: shipping a build
    // that talks to a developer's machine, and a test run that quietly writes to
    // real family data.
    final useEmulators = environment.isProduction
        ? false
        : useEmulatorsOverride ?? (environment == AppEnvironment.development);

    return AppConfig(
      environment: environment,
      useEmulators: useEmulators,
      emulators: EmulatorEndpoints(host: emulatorHost),
    );
  }

  /// Which deployment this build talks to.
  final AppEnvironment environment;

  /// Whether backend traffic is redirected to the local emulator suite.
  final bool useEmulators;

  /// Where that suite is listening.
  final EmulatorEndpoints emulators;

  /// The build-time key that overrides emulator use.
  static const String useEmulatorsKey = 'USE_EMULATORS';

  /// The build-time key that overrides the emulator host.
  static const String emulatorHostKey = 'EMULATOR_HOST';

  static const bool _useEmulatorsOverride = bool.fromEnvironment(
    useEmulatorsKey,
  );
  static const bool _hasUseEmulatorsOverride = bool.hasEnvironment(
    useEmulatorsKey,
  );
  static const String _emulatorHost = String.fromEnvironment(
    emulatorHostKey,
    defaultValue: 'localhost',
  );

  /// A one-line description for diagnostics.
  ///
  /// Carries no secret: an environment name and a host, nothing more.
  String describe() =>
      'environment=${environment.id} project=${environment.firebaseProjectId} '
      'emulators=${useEmulators ? emulators.host : 'off'}';
}
