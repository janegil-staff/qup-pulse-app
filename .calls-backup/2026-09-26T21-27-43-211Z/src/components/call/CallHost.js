// src/components/call/CallHost.js
//
// Renders the full-screen call UI as an overlay above the entire app whenever a
// call is active. Mounted once, high in the tree (App.js), INSIDE CallProvider.
//
// Why an overlay and not a navigation route: the app has two separate navigator
// trees (signup flow vs. the logged-in app) and swaps between them. A call must
// be able to appear over any screen in either tree, and must not be affected by
// navigation state changes mid-call. An absolutely-positioned overlay driven
// purely by call phase sidesteps all of that.
import React from "react";
import { View, StyleSheet } from "react-native";
import { useCall } from "../../context/CallContext";
import CallScreen from "../../screens/CallScreen.js";

export default function CallHost() {
  const { isInCall } = useCall();
  if (!isInCall) return null;
  return (
    <View style={styles.overlay}>
      <CallScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
});
