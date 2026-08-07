/// Everything that has to happen before the first frame.
library;

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:family_beacon/app/configuration/app_config.dart';
import 'package:family_beacon/app/configuration/firebase/firebase_options.dart';
import 'package:family_beacon/app/observability/app_loggers.dart';
import 'package:family_beacon/core/logging/log_event.dart';
import 'package:family_beacon/core/logging/logger.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// What starting the application produced.
///
/// Passed to the widget tree rather than read from globals, so a test can start
/// the application with a different configuration and a logger it can inspect.
final class BootstrapResult {
  /// Creates a bootstrap result.
  const BootstrapResult({required this.config, required this.logger});

  /// The configuration this build is running with.
  final AppConfig config;

  /// The logger the rest of the application records through.
  final Logger logger;
}

/// Prepares the application and returns what it needs to run.
///
/// The order matters: the binding first, then the backend, then emulator
/// redirection, and only then anything that talks to a backend service.
Future<BootstrapResult> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  final config = AppConfig.fromBuild();

  await Firebase.initializeApp(options: firebaseOptionsFor(config.environment));

  if (config.useEmulators) {
    _redirectToEmulators(config);
  }

  final logger = await _installObservability(config);
  await _activateAppCheck(config, logger);

  logger.record(
    LogEvent(
      feature: 'app',
      operation: 'bootstrap',
      outcome: LogOutcome.success,
      errorCode: null,
    ),
  );

  return BootstrapResult(config: config, logger: logger);
}

/// Points every backend client at the local emulator suite.
///
/// This runs before any client is used, so a build configured for emulators
/// cannot reach a real project even briefly during startup.
void _redirectToEmulators(AppConfig config) {
  final endpoints = config.emulators;

  FirebaseFirestore.instance.useFirestoreEmulator(
    endpoints.host,
    endpoints.firestorePort,
  );
  FirebaseFunctions.instance.useFunctionsEmulator(
    endpoints.host,
    endpoints.functionsPort,
  );
  unawaited(
    FirebaseAuth.instance.useAuthEmulator(endpoints.host, endpoints.authPort),
  );
}

/// Wires crash reporting and returns the application logger.
Future<Logger> _installObservability(AppConfig config) async {
  final crashlytics = FirebaseCrashlytics.instance;

  // Reports from a developer's machine or an emulator run would drown the real
  // signal, so collection follows the environment rather than the build mode.
  final collectReports = !config.useEmulators && !kDebugMode;
  await crashlytics.setCrashlyticsCollectionEnabled(collectReports);

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    unawaited(crashlytics.recordFlutterError(details));
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    unawaited(crashlytics.recordError(error, stack, fatal: true));
    return true;
  };

  return FanOutLogger(<Logger>[
    const ConsoleLogger(),
    if (collectReports) CrashlyticsLogger(crashlytics),
  ]);
}

/// Turns on application attestation.
///
/// The debug provider is used wherever the build is not the real production
/// one, which is what lets local and emulator testing work without weakening
/// what production enforces. A failure here is fatal in production — an
/// unattested production build is a hole, not an inconvenience — and recorded
/// but survivable anywhere else.
Future<void> _activateAppCheck(AppConfig config, Logger logger) async {
  final useDebugProvider = !config.environment.isProduction || kDebugMode;

  try {
    await FirebaseAppCheck.instance.activate(
      providerAndroid: useDebugProvider
          ? const AndroidDebugProvider()
          : const AndroidPlayIntegrityProvider(),
      providerApple: useDebugProvider
          ? const AppleDebugProvider()
          : const AppleAppAttestProvider(),
    );
  } on Object catch (error, stackTrace) {
    logger.recordFailure(
      const LogEvent(
        feature: 'app',
        operation: 'activate_app_check',
        outcome: LogOutcome.failure,
        level: LogLevel.error,
        errorCode: 'app_check_unavailable',
      ),
      error: error,
      stackTrace: stackTrace,
    );
    if (config.environment.isProduction) {
      rethrow;
    }
  }
}
