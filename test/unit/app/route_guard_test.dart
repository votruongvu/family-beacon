@TestOn('vm')
library;

import 'package:family_beacon/app/router/access_state.dart';
import 'package:family_beacon/app/router/app_routes.dart';
import 'package:family_beacon/app/router/route_guard.dart';
import 'package:test/test.dart';

void main() {
  group('while the access state is unknown', () {
    test('nobody is moved anywhere', () {
      for (final location in <String>[
        AppRoutes.home,
        AppRoutes.welcome,
        '/anything',
      ]) {
        expect(
          guardRedirect(location: location, access: AccessState.unknown),
          isNull,
          reason:
              'deciding early would flash the wrong screen at a signed-in person',
        );
      }
    });
  });

  group('when signed out', () {
    test('a guarded destination redirects to the public one', () {
      expect(
        guardRedirect(location: AppRoutes.home, access: AccessState.signedOut),
        AppRoutes.welcome,
      );
    });

    test('an unknown destination is guarded too, not let through', () {
      expect(
        guardRedirect(
          location: '/family/members',
          access: AccessState.signedOut,
        ),
        AppRoutes.welcome,
        reason: 'anything not listed as public must be guarded by default',
      );
    });

    test('the public destination is left alone', () {
      expect(
        guardRedirect(
          location: AppRoutes.welcome,
          access: AccessState.signedOut,
        ),
        isNull,
      );
    });
  });

  group('when signed in', () {
    test('a guarded destination is let through', () {
      expect(
        guardRedirect(location: AppRoutes.home, access: AccessState.signedIn),
        isNull,
      );
    });

    test(
      'an unknown destination is let through, and the router shows not-found',
      () {
        expect(
          guardRedirect(
            location: '/family/members',
            access: AccessState.signedIn,
          ),
          isNull,
          reason: 'the guard decides access, not whether a route exists',
        );
      },
    );

    test('the public destination redirects onward', () {
      expect(
        guardRedirect(
          location: AppRoutes.welcome,
          access: AccessState.signedIn,
        ),
        AppRoutes.home,
      );
    });
  });

  test('the guard never redirects a destination to itself', () {
    for (final access in AccessState.values) {
      for (final location in <String>[AppRoutes.home, AppRoutes.welcome]) {
        expect(
          guardRedirect(location: location, access: access),
          isNot(location),
          reason: 'a self-redirect would loop forever',
        );
      }
    }
  });

  test('the public set is a subset of the destinations that exist', () {
    expect(AppRoutes.public, contains(AppRoutes.welcome));
    expect(AppRoutes.public, isNot(contains(AppRoutes.home)));
  });
}
