// src/config/features.js
//
// Feature switches for things that ship in the binary but aren't ready.
// Flip a flag to true, rebuild, and the feature reappears — no other edits.

export const FEATURES = {
  // Video calls (WebRTC). Off until calling works end to end on real
  // devices — a visible button that doesn't work gets the app rejected
  // under App Review 2.1 (App Completeness).
  calls: true,
};
