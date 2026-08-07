@TestOn('vm')
library;

import 'package:family_beacon/core/error/failure.dart';
import 'package:test/test.dart';

void main() {
  test('every failure carries a stable code', () {
    expect(const NetworkUnavailableFailure().code, 'network_unavailable');
    expect(const UnexpectedFailure().code, 'unexpected');
    expect(const AuthorizationFailure().code, 'not_authorized');
    expect(const AuthorizationFailure.outsideFamily().code, 'outside_family');
    expect(
      const PermissionDeniedFailure(
        permission: PermissionKind.locationAlways,
      ).code,
      'permission_denied',
    );
  });

  test(
    'a permission failure says which permission and whether asking again helps',
    () {
      const failure = PermissionDeniedFailure(
        permission: PermissionKind.locationWhenInUse,
        permanentlyDenied: true,
      );

      expect(failure.permission, PermissionKind.locationWhenInUse);
      expect(failure.permanentlyDenied, isTrue);
    },
  );

  test('a permission failure is recoverable by default', () {
    expect(
      const PermissionDeniedFailure(
        permission: PermissionKind.notifications,
      ).permanentlyDenied,
      isFalse,
    );
  });

  test('the description names the failure and its code, not the data', () {
    expect(
      const NetworkUnavailableFailure().toString(),
      'NetworkUnavailableFailure(network_unavailable)',
    );
    expect(
      const UnexpectedFailure(debugMessage: 'index missing').toString(),
      'UnexpectedFailure(unexpected): index missing',
    );
  });

  test('a feature can define its own failure', () {
    expect(const _InvitationExpiredFailure().code, 'invitation_expired');
    expect(const _InvitationExpiredFailure(), isA<Failure>());
  });
}

/// Stands in for a failure a feature would own, proving the hierarchy stays
/// open to extension from another library.
final class _InvitationExpiredFailure extends Failure {
  const _InvitationExpiredFailure() : super(code: 'invitation_expired');
}
