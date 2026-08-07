/// The guard rule, kept separate from the router so it can be tested directly.
library;

import 'package:family_beacon/app/router/access_state.dart';
import 'package:family_beacon/app/router/app_routes.dart';

/// Decides where a person should be sent, given where they asked to go.
///
/// Returning `null` means "let them through". Returning a path means redirect
/// there.
///
/// This is a pure function of the requested location and the access state, with
/// no framework types in its signature, so every rule below is covered by an
/// ordinary unit test rather than by driving the interface.
String? guardRedirect({required String location, required AccessState access}) {
  final isPublic = AppRoutes.public.contains(location);

  return switch (access) {
    // Deciding too early would flash a welcome screen at someone who turns out
    // to be signed in. Stay where we are and wait for the answer.
    AccessState.unknown => null,

    // Somewhere guarded, without being signed in.
    AccessState.signedOut when !isPublic => AppRoutes.welcome,

    // Signed in, but sitting on a destination that only makes sense before
    // signing in.
    AccessState.signedIn when isPublic => AppRoutes.home,

    _ => null,
  };
}
