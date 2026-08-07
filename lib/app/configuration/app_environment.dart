/// Which deployment this build talks to.
library;

/// The three isolated environments.
///
/// Production data is never the default for anything. A build that does not say
/// which environment it wants gets [development], so forgetting the flag is
/// harmless rather than dangerous.
enum AppEnvironment {
  /// Local work and automated verification.
  development(
    id: 'development',
    firebaseProjectId: 'family-beacon-dev',
    applicationIdSuffix: '.dev',
    displaySuffix: ' Dev',
  ),

  /// Pilot testing against real services.
  staging(
    id: 'staging',
    firebaseProjectId: 'family-beacon-stg',
    applicationIdSuffix: '.stg',
    displaySuffix: ' Staging',
  ),

  /// What families actually use.
  production(
    id: 'production',
    firebaseProjectId: 'family-beacon-prod',
    applicationIdSuffix: '',
    displaySuffix: '',
  );

  const AppEnvironment({
    required this.id,
    required this.firebaseProjectId,
    required this.applicationIdSuffix,
    required this.displaySuffix,
  });

  /// The name used on the command line and in build configuration.
  final String id;

  /// The backend project this environment is isolated to.
  final String firebaseProjectId;

  /// What is appended to the application identifier.
  ///
  /// Distinct identifiers let all three builds sit on one device at the same
  /// time, so a staging build can never quietly replace a production one.
  final String applicationIdSuffix;

  /// What is appended to the name shown under the icon.
  final String displaySuffix;

  /// Whether this environment talks to real families' data.
  bool get isProduction => this == AppEnvironment.production;

  /// The build-time key that selects the environment.
  static const String dartDefineKey = 'APP_ENV';

  /// The environment this build was compiled for.
  ///
  /// Set with `--dart-define=APP_ENV=staging`. Selecting an environment is a
  /// build flag and never an edit, which is what keeps the three deployments
  /// genuinely isolated.
  static const String _selected = String.fromEnvironment(
    dartDefineKey,
    defaultValue: 'development',
  );

  /// Resolves the environment for this build.
  static AppEnvironment current() => parse(_selected);

  /// Resolves [id] to an environment.
  ///
  /// Throws when the name is not one of the three. An unrecognised environment
  /// is a build mistake, and failing loudly at startup is far better than
  /// silently falling back to something that points at the wrong project.
  static AppEnvironment parse(String id) {
    for (final environment in AppEnvironment.values) {
      if (environment.id == id) {
        return environment;
      }
    }
    throw ArgumentError.value(
      id,
      dartDefineKey,
      'Unknown environment. Expected one of: '
      '${AppEnvironment.values.map((environment) => environment.id).join(', ')}',
    );
  }
}
