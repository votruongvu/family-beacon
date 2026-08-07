/// Chooses the backend project for the environment this build targets.
///
/// The three option files beside this one are generated. This resolver is not,
/// so regenerating any of them leaves the selection logic intact.
library;

import 'package:family_beacon/app/configuration/app_environment.dart';
import 'package:family_beacon/app/configuration/firebase/firebase_options_development.dart';
import 'package:family_beacon/app/configuration/firebase/firebase_options_production.dart';
import 'package:family_beacon/app/configuration/firebase/firebase_options_staging.dart';
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;

/// The backend options [environment] points at, for the current platform.
///
/// This is the whole of "switching environment targets a different backend
/// project": a build flag selects the environment, the environment selects the
/// project, and no source file is edited to move between them.
FirebaseOptions firebaseOptionsFor(AppEnvironment environment) =>
    switch (environment) {
      AppEnvironment.development => DevelopmentFirebaseOptions.currentPlatform,
      AppEnvironment.staging => StagingFirebaseOptions.currentPlatform,
      AppEnvironment.production => ProductionFirebaseOptions.currentPlatform,
    };
