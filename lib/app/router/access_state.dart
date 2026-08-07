/// What the shell knows about whether someone is signed in.
///
/// Deliberately free of any framework import, so the guard that reads it stays
/// testable on the standalone runner. The provider that supplies it lives with
/// the rest of the wiring, in the composition root.
library;

/// Whether the application currently has an authenticated person.
///
/// This is the shell's view, and it is deliberately coarse. It exists so the
/// router can decide which destination to show — nothing more.
///
/// It is **not** an authorization boundary. Whether a person may read a
/// family's locations or resolve an assistance request is decided by the
/// backend, every time, for every request. Routing only decides what to draw.
enum AccessState {
  /// The application has not yet determined the answer.
  ///
  /// Distinct from [signedOut] so the shell can wait rather than flashing a
  /// welcome screen at someone who is already signed in.
  unknown,

  /// Nobody is signed in.
  signedOut,

  /// Someone is signed in.
  signedIn,
}
