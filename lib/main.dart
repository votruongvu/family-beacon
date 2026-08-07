import 'package:family_beacon/app/app.dart';
import 'package:flutter/material.dart';

/// Entry point.
///
/// Deliberately thin: everything the application needs in order to start lives
/// in the application layer, so the entry point never becomes the place where
/// wiring accumulates.
void main() {
  runApp(const FamilyBeaconApp());
}
