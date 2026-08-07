// PLACEHOLDER CONFIGURATION — NOT REAL CREDENTIALS.
//
// Replace this file once the project is provisioned:
//
//   flutterfire configure \
//     --project=family-beacon-stg \
//     --out=lib/app/configuration/firebase/firebase_options_staging.dart \
//     --ios-bundle-id=com.familybeacon.app.stg \
//     --android-package-name=com.familybeacon.app.stg
//
// See the development options for why client configuration is public and what
// must never be added here.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;

/// Backend options for the staging project.
abstract final class StagingFirebaseOptions {
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
    apiKey: 'APlaceholderKey-staging-android-0000000',
    appId: '1:000000000002:android:0000000000000000000002',
    messagingSenderId: '000000000002',
    projectId: 'family-beacon-stg',
    storageBucket: 'family-beacon-stg.firebasestorage.app',
  );

  /// iOS options.
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'APlaceholderKey-staging-ios-00000000000',
    appId: '1:000000000002:ios:0000000000000000000002',
    messagingSenderId: '000000000002',
    projectId: 'family-beacon-stg',
    storageBucket: 'family-beacon-stg.firebasestorage.app',
    iosBundleId: 'com.familybeacon.app.stg',
  );
}
