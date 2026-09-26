// src/components/call/CallHost.js
//
// Renders the full-screen call UI as an overlay above the entire app whenever a
// call is active. Mounted once, high in the tree (App.js), INSIDE CallProvider.
//
// Overlay rather than a navigation route: the app has separate navigator trees
// and swaps between them, and a call must survive navigation state changes.
//
// Also tells the user WHY a call ended when it wasn't their own doing — without
// this the call screen just vanished on decline / busy / failure.
import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useCall } from "../../context/CallContext";
import { useLang } from "../../context/LangContext.js";
import CallScreen from "../../screens/CallScreen.js";

// End reasons that need no message: the user did it themselves, or the call
// simply finished normally.
const SILENT = new Set([null, undefined, "hangup", "cancelled", "ended", "declined_by_me"]);

function messageFor(reason, t) {
  const c = t.call || {};
  switch (reason) {
    case "declined":
      return c.callDeclined || "Call declined";
    case "timeout":
      return t.callNoAnswer || "No answer";
    case "busy":
    case "already_in_call":
      return t.callBusy || "They're on another call.";
    default:
      return c.callFailed || "Could not connect the call";
  }
}

export default function CallHost() {
  const { isInCall, lastEndReason, error, endedAt } = useCall();
  const { t } = useLang();
  const shown = useRef(null);

  useEffect(() => {
    const reason = error || lastEndReason;
    if (isInCall || !endedAt || SILENT.has(reason) || shown.current === endedAt) return;
    shown.current = endedAt; // once per ended call
    Alert.alert(messageFor(reason, t));
  }, [isInCall, lastEndReason, error, endedAt, t]);

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
