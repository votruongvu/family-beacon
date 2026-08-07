// PLACEHOLDER CONFIGURATION — NOT REAL CREDENTIALS.
//
// No backend project exists for Family Beacon yet, so these values are
// syntactically valid stand-ins that let the application start against the
// local emulator suite. Emulators do not validate them.
//
// Replace this file once the project is provisioned:
//
//   flutterfire configure \
//     --project=family-beacon-dev \
//     --out=lib/app/configuration/firebase/firebase_options_development.dart \
//     --ios-bundle-id=com.familybeacon.app.dev \
//     --android-package-name=com.familybeacon.app.dev
//
// The values a client build carries are public by design — they identify the
// project, they do not authorize access to it. What protects the data is
// security rules, backend authorization, and application attestation. Never add
// a server key or a service-account credential here.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;

/// Backend options for the development project.
abstract final class DevelopmentFirebaseOptions {
  /// The options for the platform this build is running on.
  static FirebaseOptions get currentPlatform => switch (defaultTargetPlatform) {
    TargetPlatform.android => android,
    TargetPlatform.iOS => ios,
    _ => throw UnsupportedError(
      'Family Beacon targets iOS and Android only; '
      '$defaultTargetPlatform is not configured.',
    ),
  };

  /// Android options.
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'APlaceholderKey-development-android-000',
    appId: '1:000000000001:android:0000000000000000000001',
    messagingSenderId: '000000000001',
    projectId: 'family-beacon-dev',
    storageBucket: 'family-beacon-dev.firebasestorage.app',
  );

  /// iOS options.
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'APlaceholderKey-development-ios-0000000',
    appId: '1:000000000001:ios:0000000000000000000001',
    messagingSenderId: '000000000001',
    projectId: 'family-beacon-dev',
    storageBucket: 'family-beacon-dev.firebasestorage.app',
    iosBundleId: 'com.familybeacon.app.dev',
  );
}
