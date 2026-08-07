/// Every destination the application has, named in one place.
///
/// Paths are referenced through these constants rather than written as string
/// literals at each call site, so a destination can be renamed without hunting
/// through the interface for the places that pointed at it.
library;

/// The route table.
abstract final class AppRoutes {
  /// Where an unauthenticated person lands.
  ///
  /// A placeholder destination. The authentication Requirement replaces what is
  /// shown here; the route itself is part of the shell.
  static const String welcome = '/welcome';

  /// Where an authenticated person lands.
  ///
  /// A placeholder destination, replaced as product capabilities arrive.
  static const String home = '/';

  /// The Foundation's proof slice, showing a request reaching the backend and
  /// coming back.
  ///
  /// Not a product destination. It is guarded like any other, because the round
  /// trip it runs is scoped to whoever is signed in.
  static const String diagnostics = '/diagnostics';

  /// The destinations reachable without being signed in.
  ///
  /// Everything not listed here is guarded.
  static const Set<String> public = <String>{welcome};
}
