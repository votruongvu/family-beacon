/// The route table and the guard that runs before every navigation.
library;

import 'package:family_beacon/app/di/app_providers.dart';
import 'package:family_beacon/app/router/app_routes.dart';
import 'package:family_beacon/app/router/route_guard.dart';
import 'package:family_beacon/app/shell/placeholder_page.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The application's router.
///
/// Routing is declared here, in the application layer, and features are reached
/// through it. A feature never reaches back into this file — the architecture
/// check enforces that direction.
final Provider<GoRouter> appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: AppRoutes.home,
    redirect: (context, state) => guardRedirect(
      location: state.matchedLocation,
      access: ref.read(accessStateProvider),
    ),
    routes: <RouteBase>[
      GoRoute(
        path: AppRoutes.welcome,
        builder: (context, state) => const PlaceholderPage(
          title: 'Welcome',
          message: 'Signing in arrives with the authentication Requirement.',
        ),
      ),
      GoRoute(
        path: AppRoutes.home,
        builder: (context, state) => const PlaceholderPage(
          title: 'Family Beacon',
          message:
              'Product capabilities arrive as Requirements are implemented.',
        ),
      ),
    ],
    errorBuilder: (context, state) => PlaceholderPage(
      title: 'Not found',
      message: 'No destination matches ${state.uri.path}.',
    ),
  );
});
