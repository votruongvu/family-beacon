// PLACEHOLDER CONFIGURATION — NOT REAL CREDENTIALS.
//
// Replace this file once the project is provisioned:
//
//   flutterfire configure \
//     --project=family-beacon-prod \
//     --out=lib/app/configuration/firebase/firebase_options_production.dart \
//     --ios-bundle-id=com.familybeacon.app \
//     --android-package-name=com.familybeacon.app
//
// See the development options for why client configuration is public and what
// must never be added here.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;

/// Backend options for the production project.
abstract final class ProductionFirebaseOptions {
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
    apiKey: 'APlaceholderKey-production-android-0000',
    appId: '1:000000000003:android:0000000000000000000003',
    messagingSenderId: '000000000003',
    projectId: 'family-beacon-prod',
    storageBucket: 'family-beacon-prod.firebasestorage.app',
  );

  /// iOS options.
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'APlaceholderKey-production-ios-00000000',
    appId: '1:000000000003:ios:0000000000000000000003',
    messagingSenderId: '000000000003',
    projectId: 'family-beacon-prod',
    storageBucket: 'family-beacon-prod.firebasestorage.app',
    iosBundleId: 'com.familybeacon.app',
  );
}
