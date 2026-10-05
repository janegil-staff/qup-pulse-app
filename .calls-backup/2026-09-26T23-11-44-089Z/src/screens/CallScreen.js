// local-pulse-app/src/screens/CallScreen.js
//
// Full-screen 1:1 call UI. Rendered as an overlay by components/call/CallHost.js
// whenever the call phase leaves idle — it is NOT a navigation route, so it does
// not depend on a `navigation` prop (CallHost unmounts it when the call ends).
//
// Wired to the real app:
//   - useLang() -> { t } where t is a flat string map (t.callCalling, ...)
//   - useStyles(factory) from theme.js, tokens: accent / success / danger / text
//   - text glyphs (the app has no @expo/vector-icons)

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, StatusBar, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCall, CALL_PHASE } from "../context/CallContext";
import { useLang } from "../context/LangContext.js";
import { useStyles } from "../theme/theme.js";

// react-native-webrtc is a native module absent from Expo Go / any build that
// wasn't prebuilt with it. Resolve RTCView defensively at import time so simply
// loading this screen can never crash the app; if it's missing we fall back to
// the avatar placeholder (a call can't actually run without it anyway).
let RTCView = null;
try {
  // eslint-disable-next-line global-require
  RTCView = require("react-native-webrtc").RTCView;
} catch (e) {
  RTCView = null;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function CallScreen() {
  const { t } = useLang();
  const styles = useStyles(callStylesFactory);

  const {
    phase,
    media,
    peer,
    localStream,
    remoteStream,
    micEnabled,
    cameraEnabled,
    startedAt,
    isCaller,
    endCall,
    cancelCall,
    declineCall,
    acceptCall,
    toggleMicrophone,
    toggleCamera,
    switchCamera,
  } = useCall();

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (phase !== CALL_PHASE.ACTIVE || !startedAt) return undefined;
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [phase, startedAt]);

  const peerName = peer?.displayName || peer?.username || t.callUnknownUser || "Unknown";

  const statusLabel = useMemo(() => {
    switch (phase) {
      case CALL_PHASE.OUTGOING:
        return t.callCalling || "Calling…";
      case CALL_PHASE.INCOMING:
        return media === "video"
          ? t.callIncomingVideo || "Incoming video call"
          : t.callIncomingAudio || "Incoming call";
      case CALL_PHASE.CONNECTING:
        return t.callConnecting || "Connecting…";
      case CALL_PHASE.RECONNECTING:
        return t.callReconnecting || "Reconnecting…";
      case CALL_PHASE.ACTIVE:
        return formatDuration(elapsed);
      default:
        return "";
    }
  }, [phase, media, elapsed, t]);

  const showRemoteVideo =
    !!RTCView && media === "video" && remoteStream && phase === CALL_PHASE.ACTIVE;
  const showLocalVideo = !!RTCView && media === "video" && localStream && cameraEnabled;
  const isRinging = phase === CALL_PHASE.OUTGOING || phase === CALL_PHASE.INCOMING;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {showRemoteVideo ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={styles.remotePlaceholder}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>
              {peerName.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
      )}

      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.peerName} numberOfLines={1}>
            {peerName}
          </Text>
          <Text style={styles.status}>{statusLabel}</Text>
        </View>

        {showLocalVideo && (
          <Pressable style={styles.localWrapper} onPress={switchCamera}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              mirror
              zOrder={1}
            />
          </Pressable>
        )}

        <View style={styles.controls}>
          {phase === CALL_PHASE.INCOMING ? (
            <View style={styles.answerRow}>
              <ControlButton
                styles={styles}
                variant="danger"
                glyph="✕"
                label={t.callDecline || "Decline"}
                onPress={declineCall}
              />
              <ControlButton
                styles={styles}
                variant="accept"
                glyph={media === "video" ? "🎥" : "✓"}
                label={t.callAccept || "Accept"}
                onPress={acceptCall}
              />
            </View>
          ) : (
            <View style={styles.controlRow}>
              <ControlButton
                styles={styles}
                variant={micEnabled ? "neutral" : "muted"}
                glyph={micEnabled ? "🎙" : "🔇"}
                label={micEnabled ? t.callMute || "Mute" : t.callUnmute || "Unmute"}
                onPress={toggleMicrophone}
              />

              {media === "video" && (
                <ControlButton
                  styles={styles}
                  variant={cameraEnabled ? "neutral" : "muted"}
                  glyph={cameraEnabled ? "🎥" : "🚫"}
                  label={
                    cameraEnabled
                      ? t.callCameraOff || "Camera off"
                      : t.callCameraOn || "Camera on"
                  }
                  onPress={toggleCamera}
                />
              )}

              {media === "video" && (
                <ControlButton
                  styles={styles}
                  variant="neutral"
                  glyph="🔄"
                  label={t.callSwitchCamera || "Flip"}
                  onPress={switchCamera}
                />
              )}

              <ControlButton
                styles={styles}
                variant="danger"
                glyph="✕"
                label={
                  isRinging && isCaller
                    ? t.callCancel || "Cancel"
                    : t.callEnd || "End"
                }
                onPress={isRinging && isCaller ? cancelCall : endCall}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function ControlButton({ styles, variant, glyph, label, onPress }) {
  const backgroundStyle = {
    neutral: styles.buttonNeutral,
    muted: styles.buttonMuted,
    danger: styles.buttonDanger,
    accept: styles.buttonAccept,
  }[variant];

  const glyphStyle = variant === "muted" ? styles.glyphDark : styles.glyph;

  return (
    <View style={styles.buttonWrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          backgroundStyle,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={glyphStyle}>{glyph}</Text>
      </Pressable>
      <Text style={styles.buttonLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const callStylesFactory = ({ colors }) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "#0B1220",
    },
    remoteVideo: {
      ...StyleSheet.absoluteFillObject,
    },
    remotePlaceholder: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#0B1220",
    },
    avatar: {
      width: 128,
      height: 128,
      borderRadius: 64,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
    },
    avatarInitial: {
      color: "#FFFFFF",
      fontSize: 48,
      fontWeight: "600",
    },
    overlay: {
      flex: 1,
      justifyContent: "space-between",
    },
    header: {
      alignItems: "center",
      paddingTop: 24,
      paddingHorizontal: 24,
    },
    peerName: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "600",
      textShadowColor: "rgba(0,0,0,0.45)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    status: {
      marginTop: 6,
      color: "rgba(255,255,255,0.75)",
      fontSize: 15,
      fontVariant: ["tabular-nums"],
    },
    localWrapper: {
      position: "absolute",
      top: Platform.OS === "ios" ? 96 : 80,
      right: 16,
      width: 108,
      height: 156,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
      backgroundColor: "#000000",
    },
    localVideo: {
      flex: 1,
    },
    controls: {
      paddingBottom: 28,
      paddingHorizontal: 20,
    },
    controlRow: {
      flexDirection: "row",
      justifyContent: "space-evenly",
      alignItems: "flex-start",
    },
    answerRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "flex-start",
      paddingHorizontal: 24,
    },
    buttonWrapper: {
      alignItems: "center",
      width: 76,
    },
    button: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.96 }],
    },
    buttonNeutral: {
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    buttonMuted: {
      backgroundColor: "#FFFFFF",
    },
    buttonDanger: {
      backgroundColor: colors.danger || "#E5484D",
    },
    buttonAccept: {
      backgroundColor: colors.success || "#30A46C",
    },
    glyph: {
      fontSize: 24,
      color: "#FFFFFF",
    },
    glyphDark: {
      fontSize: 24,
      color: "#0B1220",
    },
    buttonLabel: {
      marginTop: 8,
      fontSize: 12,
      color: "rgba(255,255,255,0.8)",
      textAlign: "center",
    },
  });
