/// The failure model every layer above the data boundary speaks.
///
/// Infrastructure exceptions never travel upwards. A data implementation
/// catches what its SDK throws and returns one of these instead, so the domain
/// and the interface only ever handle values they can reason about.
library;

/// A failure that a caller can act on.
///
/// This is `base` rather than `sealed` on purpose: features define their own
/// failures — an expired invitation, an invalid assistance transition — and
/// those live with the feature that owns them. `base` keeps the hierarchy
/// closed to `implements`, so every failure really is a [Failure], while
/// staying open to `extends` from another library.
abstract base class Failure {
  /// Creates a failure.
  const Failure({required this.code, this.debugMessage, this.cause});

  /// A stable, non-sensitive identifier for this kind of failure.
  ///
  /// Safe to log and to branch on. It must never carry a value taken from the
  /// data that failed — no phone number, no coordinate, no token.
  final String code;

  /// Detail for diagnosis, never for display.
  ///
  /// The interface renders text chosen for the code, not this string.
  final String? debugMessage;

  /// The original error, kept for crash reporting only.
  final Object? cause;

  @override
  String toString() => debugMessage == null
      ? '$runtimeType($code)'
      : '$runtimeType($code): $debugMessage';
}

/// The device could not reach the network, or the request timed out.
final class NetworkUnavailableFailure extends Failure {
  /// Creates a network-unavailable failure.
  const NetworkUnavailableFailure({super.debugMessage, super.cause})
    : super(code: 'network_unavailable');
}

/// A platform permission the operation needs was refused or not yet granted.
final class PermissionDeniedFailure extends Failure {
  /// Creates a permission-denied failure for [permission].
  const PermissionDeniedFailure({
    required this.permission,
    this.permanentlyDenied = false,
    super.debugMessage,
    super.cause,
  }) : super(code: 'permission_denied');

  /// Which capability was refused.
  final PermissionKind permission;

  /// Whether the person must change this in system settings.
  ///
  /// When true, asking again in the application will not produce a prompt.
  final bool permanentlyDenied;
}

/// The platform permissions this baseline knows about.
enum PermissionKind {
  /// Location while the application is in use.
  locationWhenInUse,

  /// Location while the application is in the background.
  locationAlways,

  /// Delivery of notifications to the device.
  notifications,
}

/// The caller is not allowed to perform the operation.
///
/// The backend is the authority on this. Receiving it means the server said no,
/// not that a local check failed.
final class AuthorizationFailure extends Failure {
  /// Creates an authorization failure.
  const AuthorizationFailure({super.debugMessage, super.cause})
    : super(code: 'not_authorized');

  /// Creates an authorization failure for a request that crossed a family
  /// boundary.
  const AuthorizationFailure.outsideFamily({super.debugMessage, super.cause})
    : super(code: 'outside_family');
}

/// Something failed in a way the caller was not built to handle.
///
/// Reaching this is a signal to look at crash reporting, not a state to design
/// an interface around.
final class UnexpectedFailure extends Failure {
  /// Creates an unexpected failure.
  const UnexpectedFailure({super.debugMessage, super.cause})
    : super(code: 'unexpected');
}
