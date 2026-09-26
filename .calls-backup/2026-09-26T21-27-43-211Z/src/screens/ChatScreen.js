// localpulse/app/src/screens/ChatScreen.js
//
// Keyboard handling for Expo Go: uses React Native's built-in
// KeyboardAvoidingView with `padding` on both platforms and offset 0. The KAV
// starts BELOW the header (the header is a sibling above it), so its own top
// edge is the reference and no header math is needed. While the keyboard is
// open we drop the bottom safe-area inset from the input row, because on
// Android insets.bottom (the nav-bar height) is still reported when the
// keyboard is up and would otherwise add a surplus gap above the keyboard.
//
// LIVE DELIVERY: messages arrive live via the chat:message socket event, but
// Android sockets are unreliable (background/reconnect drops room membership).
// As a fallback, this screen POLLS refetchActiveMessages every few seconds
// while open, so a message that never arrived over the socket still appears.
// The store merges by id, so polling never duplicates already-delivered
// messages.
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChatStore } from "../store/chatStore.js";
import { useAuth } from "../context/AuthContext.js";
import ScreenHeader from "../components/ScreenHeader.js";
import { theme, makeStyles, useStyles } from "../theme/theme.js";
import { useLang } from "../context/LangContext.js";
// with the other imports
import { getChatSocket } from "../api/socket.js";
import DeleteMessageButton from "../components/DeleteMessageButton.js";
import { useMessageActions } from "../hooks/useMessageActions.js";
import MessageActionSheet from "../components/MessageActionSheet.js";
import useTyping from "../hooks/useTyping.js";
import TypingIndicator from "../components/TypingIndicator.js";
import { useCall, CALL_PHASE } from "../context/CallContext.js";

export default function ChatScreen({ route, navigation }) {
  console.log("[ChatScreen] render");
  const { conversationId, title, peerId } = route.params;
  const styles = useStyles(stylesFactory);
  const { startCall, phase } = useCall();
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const messages = useChatStore((s) => s.messages);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const restoreMessage = useChatStore((s) => s.restoreMessage);
  const sendingImage = useChatStore((s) => s.sendingImage);
  const enterConversation = useChatStore((s) => s.enterConversation);
  const leaveConversation = useChatStore((s) => s.leaveConversation);
  const refetchActiveMessages = useChatStore((s) => s.refetchActiveMessages);
  const send = useChatStore((s) => s.send);
  const sendImage = useChatStore((s) => s.sendImage);
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const [fullImage, setFullImage] = useState(null);
  const { t } = useLang();

  // While the keyboard is up, drop the bottom safe-area inset (nav-bar height)
  // so padding-behavior KAV doesn't lift the input by keyboardHeight + navBar.
  const [kbVisible, setKbVisible] = useState(false);

  // inside the component, near your other hooks
  const socket = getChatSocket();
  const { peerTyping, onTextChange, stopTyping } = useTyping({
    socket,
    conversationId,
  });

  // The message a long-press opened the sheet for, with whether it is
  // mine — the sheet needs both and recomputing `mine` there would mean
  // duplicating the comparison renderItem already makes.
  const [sheetFor, setSheetFor] = useState(null);

  // Logs before setting state so Metro shows whether the touch reached
  // the handler at all — which separates 'gesture not landing' from
  // 'sheet not rendering', two failures that look identical on screen.
  function openSheet(msg, mine) {
    console.log("[ChatScreen] openSheet", msg?.id, { mine });
    setSheetFor({ msg, mine });
  }

  // Hide, retract, report and the chat:message:retracted listener. All
  // four in one hook on purpose; see useMessageActions.js.
  const messageActions = useMessageActions({
    socket,
    conversationId,
    removeMessage,
    restoreMessage,
    t: t,
  });

  useEffect(() => {
    if (!socket || !conversationId) return undefined;
    socket.emit("conversation:join", conversationId);
    const rejoin = () => socket.emit("conversation:join", conversationId);
    socket.on("connect", rejoin);
    return () => {
      socket.off("connect", rejoin);
      socket.emit("conversation:leave", conversationId);
    };
  }, [socket, conversationId]);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKbVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKbVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    enterConversation(conversationId);
    return () => leaveConversation();
  }, [conversationId, enterConversation, leaveConversation]);

  // Poll for new messages while the thread is open — fallback for unreliable
  // socket delivery on Android. The store merges by id, so this is cheap and
  // never duplicates messages already delivered via chat:message.
  useEffect(() => {
    const id = setInterval(() => {
      refetchActiveMessages();
    }, 4000);
    return () => clearInterval(id);
  }, [conversationId, refetchActiveMessages]);

  // messages is oldest-first from the store. The list is inverted (renders from
  // the bottom up), so we feed it newest-first. useMemo avoids reversing on
  // every render.
  const inverted = React.useMemo(() => [...messages].reverse(), [messages]);

  // In an inverted list the bottom is offset 0. When messages first arrive
  // (they load async after mount), snap to offset 0 so the newest message sits
  // flush against the input instead of the list holding its old position.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (!didInitialScroll.current && inverted.length) {
      didInitialScroll.current = true;
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    }
  }, [inverted.length]);

  // Snap to the newest message (offset 0) whenever the count grows — sending or
  // receiving. Skips the very first population, which the initial-scroll effect
  // above already handles.
  const prevLen = useRef(0);
  useEffect(() => {
    if (inverted.length > prevLen.current && prevLen.current !== 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    }
    prevLen.current = inverted.length;
  }, [inverted.length]);

  function submit() {
    if (!text.trim()) return;

    send(text, {
      title: t.chatPendingTitle,
      chatPendingLimit: t.chatPendingLimit,
      chatPendingRecipient: t.chatPendingRecipient,
      default: t.chatSendFailed,
    });

    setText("");
    stopTyping();
  }

  async function attachImage() {
    if (sendingImage) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to send a picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType
        ? ["images"]
        : ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;

    // sendImage resolves to an error string, or null on success.
    const err = await sendImage(result.assets[0].uri);
    if (err) Alert.alert("Could not send", err);
  }

  // Video-call button in the header. Only shown when we know who the peer is
  // (passed in the Chat route params). The server is the source of truth for
  // whether a call is actually allowed here (both sides must have messaged);
  // if it rejects call:invite, CallContext tears the attempt down cleanly.
  const canStartCall = !!peerId && phase === CALL_PHASE.IDLE;
  const callButton = peerId ? (
    <Pressable
      onPress={() =>
        startCall({
          conversationId,
          peer: { id: peerId, displayName: title },
          media: "video",
        })
      }
      disabled={!canStartCall}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={t.callVideo || "Video call"}
    >
      <Text
        style={{
          fontSize: 22,
          color: theme.colors.text,
          opacity: canStartCall ? 1 : 0.4,
        }}
      >
        🎥
      </Text>
    </Pressable>
  ) : null;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={title || "Chat"}
        onBack={() => navigation.goBack()}
        right={callButton}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={kbVisible ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={inverted}
          inverted
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: theme.spacing(3) }}
          renderItem={({ item }) => {
            const mine = String(item.sender?.id) === String(me?.id);
            // Image bubbles drop the padding and background — the photo is the
            // bubble. Text bubbles are unchanged.
            if (item.imageUrl) {
              return (
                <View
                  style={[
                    styles.bubbleRow,
                    mine ? styles.rowMine : styles.rowTheirs,
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      setFullImage(item.imageUrl);
                    }}
                    onLongPress={() => openSheet(item, mine)}
                    delayLongPress={350}
                  >
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.imageBubble}
                      resizeMode="cover"
                    />
                  </Pressable>
                </View>
              );
            }
            return (
              <View
                style={[
                  styles.bubbleRow,
                  mine ? styles.rowMine : styles.rowTheirs,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                  ]}
                >
                  <Pressable
                    onPress={() => openSheet(item, mine)}
                    onLongPress={() => openSheet(item, mine)}
                    delayLongPress={350}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "flex-start" }}
                    >
                      <Text
                        style={[styles.msgText, mine && styles.msgTextMine]}
                      >
                        {item.text}
                      </Text>
                      {/* Own messages only; the component returns null otherwise. */}
                      <DeleteMessageButton
                        msg={item}
                        mine={mine}
                        m={t}
                        onDeleted={removeMessage}
                      />
                    </View>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
        <MessageActionSheet
          sheetFor={sheetFor}
          onClose={() => setSheetFor(null)}
          actions={messageActions}
          m={t}
          theme={theme}
        />

        {peerTyping && <TypingIndicator />}

        <View
          style={[
            styles.inputRow,
            {
              paddingBottom: kbVisible
                ? theme.spacing(3)
                : Math.max(insets.bottom, theme.spacing(3)),
            },
          ]}
        >
          <Pressable
            style={styles.attachBtn}
            onPress={attachImage}
            disabled={sendingImage}
          >
            {sendingImage ? (
              <ActivityIndicator size="small" color={theme.colors.textDim} />
            ) : (
              <Text style={styles.attachText}>＋</Text>
            )}
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor={theme.colors.textDim}
            value={text}
            onChangeText={(v) => {
              setText(v);
              onTextChange(v);
            }}
            multiline
          />
          <Pressable style={styles.sendBtn} onPress={submit}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {/* Fullscreen viewer. `resizeMode="contain"` so a portrait photo isn't
          cropped — the bubble crops, the viewer must not. */}
      <Modal
        visible={!!fullImage}
        transparent
        animationType="fade"
        onRequestClose={() => setFullImage(null)}
      >
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => setFullImage(null)}
        >
          <Image
            source={{ uri: fullImage }}
            style={styles.viewerImage}
            resizeMode="contain"
          />
          <View style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Text style={styles.viewerCloseText}>×</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const stylesFactory = ({ colors, spacing, radius }) =>
  StyleSheet.create({
    viewerBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.95)",
      justifyContent: "center",
    },
    viewerImage: { width: "100%", height: "100%" },
    viewerClose: {
      position: "absolute",
      right: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    viewerCloseText: {
      color: "#fff",
      fontSize: 26,
      fontWeight: "300",
      marginTop: -3,
    },
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    bubbleRow: { marginTop: spacing(2), flexDirection: "row" },
    rowMine: { justifyContent: "flex-end" },
    rowTheirs: { justifyContent: "flex-start" },
    bubble: {
      maxWidth: "78%",
      paddingHorizontal: spacing(3.5),
      paddingVertical: spacing(2.5),
      borderRadius: radius.lg,
    },
    bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
    bubbleTheirs: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 4,
    },
    imageBubble: {
      width: 220,
      height: 220,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceAlt,
    },
    msgText: { color: colors.text, fontSize: 15, lineHeight: 20 },
    msgTextMine: { color: "#fff" },
    typing: {
      color: colors.textDim,
      fontSize: 12,
      paddingHorizontal: spacing(4),
      paddingBottom: spacing(1),
      fontStyle: "italic",
    },
    inputRow: {
      flexDirection: "row",
      paddingHorizontal: spacing(3),
      paddingTop: spacing(3),
      gap: spacing(2),
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "flex-end",
    },
    attachBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    attachText: {
      color: colors.textDim,
      fontSize: 24,
      fontWeight: "300",
      marginTop: -2,
    },
    input: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      borderRadius: radius.md,
      paddingHorizontal: spacing(4),
      paddingVertical: spacing(2.5),
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: 120,
    },
    sendBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing(4),
      height: 44,
      justifyContent: "center",
    },
    sendText: { color: "#fff", fontWeight: "700" },
  });
