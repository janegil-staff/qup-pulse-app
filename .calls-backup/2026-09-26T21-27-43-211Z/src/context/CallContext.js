// local-pulse-app/src/context/CallContext.js

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, PermissionsAndroid } from "react-native";
import CallService from "../services/webrtc/CallService";
import { useAuth } from "./AuthContext";
import { api } from "../api/client.js";
import { getChatSocket, connectChatSocket } from "../api/socket.js";

/**
 * Owns the entire call lifecycle for the app. Mount <CallProvider> high in the
 * tree — above navigation — so an incoming call can be surfaced from any screen.
 *
 * WIRING (adapted to local-pulse-app):
 *   - The socket is the shared Socket.IO singleton from api/socket.js
 *     (getChatSocket / connectChatSocket) — the app has no SocketContext.
 *   - useAuth() returns { user, token }; the profile id is `user.id`
 *     (with a legacy `_id` fallback).
 *   - `api` is the fetch-based client from api/client.js; ICE config comes
 *     from api.getIceServers().
 *
 * State machine:
 *   idle → outgoing → connecting → active → idle
 *   idle → incoming → connecting → active → idle
 *
 * ORDERING NOTE (this bit is load-bearing):
 * The server emits `call:accepted` to the caller synchronously inside its
 * `call:accept` handler. That means the caller's offer can land on the callee
 * before the callee's own ack callback has run. So the callee builds its media
 * and peer connection BEFORE emitting `call:accept`, and `onOffer` additionally
 * buffers an offer that somehow still arrives early. Either mechanism alone
 * fixes it; both together make the ordering irrelevant.
 */

export const CALL_PHASE = {
  IDLE: "idle",
  OUTGOING: "outgoing",
  INCOMING: "incoming",
  CONNECTING: "connecting",
  ACTIVE: "active",
  RECONNECTING: "reconnecting",
};

const CallContext = createContext(null);

const INITIAL_STATE = {
  phase: CALL_PHASE.IDLE,
  callId: null,
  conversationId: null,
  media: "video",
  isCaller: false,
  peer: null,
  localStream: null,
  remoteStream: null,
  micEnabled: true,
  cameraEnabled: true,
  isFrontCamera: true,
  startedAt: null,
  lastEndReason: null,
  error: null,
};

const log = (...args) => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[call]", ...args);
  }
};

async function requestAndroidPermissions(media) {
  if (Platform.OS !== "android") return true;

  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (media === "video")
    permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);

  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

async function fetchIceServers() {
  try {
    const data = await api.getIceServers();
    if (!data?.relayAvailable) {
      log("TURN not configured on the server — expect failures on mobile data");
    }
    return data?.iceServers || [];
  } catch (error) {
    log(
      "ice-servers fetch failed, falling back to public STUN",
      error?.message,
    );
    return [{ urls: ["stun:stun.l.google.com:19302"] }];
  }
}

export function CallProvider({ children }) {
  const { user, token } = useAuth();

  // The app has no SocketContext — the shared, authenticated Socket.IO client
  // lives in api/socket.js as a singleton, and it doesn't exist until after
  // login. Track it in state keyed on the auth token: once the user logs in,
  // connectChatSocket() returns the (idempotent) instance and the signaling
  // effect below subscribes to it. Logging out clears it.
  const [socket, setSocket] = useState(() => getChatSocket());

  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return undefined;
    }
    setSocket(connectChatSocket());
    return undefined;
  }, [token]);

  const serviceRef = useRef(null);
  const callIdRef = useRef(null);
  const iceServersRef = useRef([]);
  // Holds an offer that arrived before the peer connection existed.
  const pendingOfferRef = useRef(null);
  // Mirrors state.phase so socket handlers never read a stale closure.
  const phaseRef = useRef(CALL_PHASE.IDLE);

  const patch = useCallback((updates) => {
    setState((prev) => {
      if (updates.phase && updates.phase !== prev.phase) {
        log("phase", prev.phase, "→", updates.phase);
      }
      return { ...prev, ...updates };
    });
  }, []);

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  // ------------------------------------------------------------------
  // Teardown
  // ------------------------------------------------------------------
  const teardown = useCallback((reason = null) => {
    log("teardown", reason);
    serviceRef.current?.destroy();
    serviceRef.current = null;
    callIdRef.current = null;
    iceServersRef.current = [];
    pendingOfferRef.current = null;
    phaseRef.current = CALL_PHASE.IDLE;

    setState({ ...INITIAL_STATE, lastEndReason: reason });
  }, []);

  /**
   * Create the service and subscribe to its events. Callbacks that need to
   * reach the server go through the socket here — CallService stays unaware
   * of transport.
   */
  const buildService = useCallback(
    (callId) => {
      const service = new CallService();
      serviceRef.current = service;

      service.on("localStream", (stream) => {
        log("local stream:", stream.getVideoTracks().length, "video track(s)");
        patch({ localStream: stream });
      });

      service.on("remoteStream", (stream) => {
        log("remote stream:", stream.getVideoTracks().length, "video track(s)");
        patch({ remoteStream: stream });
      });

      service.on("iceCandidate", (candidate) => {
        socket?.emit("call:ice", { callId, candidate });
      });

      service.on("connectionState", (connectionState) => {
        log("connectionState", connectionState);

        if (connectionState === "connected") {
          socket?.emit("call:connected", {
            callId,
            usedRelay: service.usedRelay,
          });
          patch({ phase: CALL_PHASE.ACTIVE, startedAt: Date.now() });
        } else if (connectionState === "reconnecting") {
          patch({ phase: CALL_PHASE.RECONNECTING });
        } else if (connectionState === "failed") {
          socket?.emit("call:end", { callId });
          teardown("failed");
        }
      });

      service.on("error", (error) => {
        log("CallService error", error?.message || error);
      });

      return service;
    },
    [socket, patch, teardown],
  );

  /**
   * Bring up local media and the peer connection. Shared by both sides so the
   * setup order is identical regardless of who initiated.
   */
  const prepareMedia = useCallback(
    async ({ callId, media, iceServers }) => {
      const service = buildService(callId);
      await service.startLocalStream(media);
      service.createPeerConnection(iceServers);
      log("peer connection ready");
      return service;
    },
    [buildService],
  );

  // ------------------------------------------------------------------
  // Outgoing
  // ------------------------------------------------------------------
  const startCall = useCallback(
    async ({ conversationId, peer, media = "video" }) => {
      if (!socket?.connected) {
        patch({ error: "no_connection" });
        return;
      }
      if (phaseRef.current !== CALL_PHASE.IDLE) return;

      const granted = await requestAndroidPermissions(media);
      if (!granted) {
        patch({ error: "permission_denied" });
        return;
      }

      phaseRef.current = CALL_PHASE.OUTGOING;
      patch({
        phase: CALL_PHASE.OUTGOING,
        conversationId,
        peer,
        media,
        isCaller: true,
        cameraEnabled: media === "video",
        error: null,
        lastEndReason: null,
      });

      socket.emit(
        "call:invite",
        { conversationId, media },
        async (response) => {
          if (!response?.ok) {
            log("invite rejected", response?.error);
            teardown(response?.error || "invite_failed");
            patch({ error: response?.error || "invite_failed" });
            return;
          }

          const callId = response.call.callId;
          callIdRef.current = callId;
          iceServersRef.current =
            response.iceServers?.length > 0
              ? response.iceServers
              : await fetchIceServers();

          patch({ callId });

          try {
            // The peer connection exists from here, but the offer waits for
            // `call:accepted` — no point gathering ICE for an unanswered call.
            await prepareMedia({
              callId,
              media,
              iceServers: iceServersRef.current,
            });
          } catch (error) {
            log("media_error (caller)", error?.message);
            socket.emit("call:cancel", { callId });
            teardown("media_error");
            patch({ error: "media_error" });
          }
        },
      );
    },
    [socket, patch, teardown, prepareMedia],
  );

  const cancelCall = useCallback(() => {
    const callId = callIdRef.current;
    if (callId) socket?.emit("call:cancel", { callId });
    teardown("cancelled");
  }, [socket, teardown]);

  // ------------------------------------------------------------------
  // Incoming
  // ------------------------------------------------------------------
  const acceptCall = useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || !socket) return;

    const { media } = state;

    const granted = await requestAndroidPermissions(media);
    if (!granted) {
      socket.emit("call:decline", { callId });
      teardown("permission_denied");
      patch({ error: "permission_denied" });
      return;
    }

    patch({ phase: CALL_PHASE.CONNECTING });

    // Everything the offer needs must exist before the caller is told to send
    // it, so ICE comes over REST rather than from the accept ack.
    let service;
    try {
      iceServersRef.current = await fetchIceServers();
      service = await prepareMedia({
        callId,
        media,
        iceServers: iceServersRef.current,
      });
    } catch (error) {
      log("media_error (callee)", error?.message);
      socket.emit("call:decline", { callId });
      teardown("media_error");
      patch({ error: "media_error" });
      return;
    }

    socket.emit("call:accept", { callId }, async (response) => {
      if (!response?.ok) {
        log("accept rejected", response?.error);
        teardown(response?.error || "accept_failed");
        return;
      }

      // If the offer beat us here anyway, answer it now.
      const buffered = pendingOfferRef.current;
      if (buffered && buffered.callId === callId) {
        pendingOfferRef.current = null;
        try {
          const answer = await service.createAnswer(buffered.sdp);
          socket.emit("call:answer", { callId, sdp: answer });
          log("answered buffered offer");
        } catch (error) {
          log("buffered createAnswer failed", error?.message);
          socket.emit("call:end", { callId });
          teardown("answer_failed");
        }
      }
    });
  }, [socket, state, patch, teardown, prepareMedia]);

  const declineCall = useCallback(() => {
    const callId = callIdRef.current;
    if (callId) socket?.emit("call:decline", { callId });
    teardown("declined");
  }, [socket, teardown]);

  const endCall = useCallback(() => {
    const callId = callIdRef.current;
    if (callId) socket?.emit("call:end", { callId });
    teardown("hangup");
  }, [socket, teardown]);

  // ------------------------------------------------------------------
  // In-call controls
  // ------------------------------------------------------------------
  const toggleMicrophone = useCallback(() => {
    setState((prev) => {
      const next = !prev.micEnabled;
      serviceRef.current?.setMicrophoneEnabled(next);
      return { ...prev, micEnabled: next };
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setState((prev) => {
      const next = !prev.cameraEnabled;
      serviceRef.current?.setCameraEnabled(next);
      return { ...prev, cameraEnabled: next };
    });
  }, []);

  const switchCamera = useCallback(() => {
    const isFrontCamera = serviceRef.current?.switchCamera();
    patch({ isFrontCamera: Boolean(isFrontCamera) });
  }, [patch]);

  // ------------------------------------------------------------------
  // Socket wiring
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = (call) => {
      log("incoming", call.callId, call.media);

      // Already busy — tell the server so the caller gets a proper "busy".
      if (callIdRef.current || phaseRef.current !== CALL_PHASE.IDLE) {
        socket.emit("call:decline", { callId: call.callId });
        return;
      }

      callIdRef.current = call.callId;
      phaseRef.current = CALL_PHASE.INCOMING;
      patch({
        phase: CALL_PHASE.INCOMING,
        callId: call.callId,
        conversationId: call.conversationId,
        media: call.media,
        isCaller: false,
        cameraEnabled: call.media === "video",
        peer: { _id: call.callerId },
        error: null,
        lastEndReason: null,
      });
    };

    // The callee answered on another device.
    const onHandled = ({ callId }) => {
      if (
        callIdRef.current === callId &&
        phaseRef.current === CALL_PHASE.INCOMING
      ) {
        teardown(null);
      }
    };

    const onAccepted = async ({ callId }) => {
      if (callIdRef.current !== callId) return;

      const service = serviceRef.current;
      if (!service) {
        log("accepted but caller has no service — aborting");
        socket.emit("call:end", { callId });
        teardown("offer_failed");
        return;
      }

      patch({ phase: CALL_PHASE.CONNECTING });

      try {
        const sdp = await service.createOffer();
        socket.emit("call:offer", { callId, sdp });
        log("offer sent");
      } catch (error) {
        log("createOffer failed", error?.message);
        socket.emit("call:end", { callId });
        teardown("offer_failed");
      }
    };

    const onOffer = async ({ callId, sdp }) => {
      if (callIdRef.current !== callId) return;

      const service = serviceRef.current;
      if (!service || !service.pc) {
        // Peer connection not up yet — hold it, acceptCall will answer.
        log("offer arrived early, buffering");
        pendingOfferRef.current = { callId, sdp };
        return;
      }

      try {
        const answer = await service.createAnswer(sdp);
        socket.emit("call:answer", { callId, sdp: answer });
        log("answer sent");
      } catch (error) {
        log("createAnswer failed", error?.message);
        socket.emit("call:end", { callId });
        teardown("answer_failed");
      }
    };

    const onAnswer = async ({ callId, sdp }) => {
      if (callIdRef.current !== callId) return;
      try {
        await serviceRef.current?.applyAnswer(sdp);
        log("answer applied");
      } catch (error) {
        log("applyAnswer failed", error?.message);
        socket.emit("call:end", { callId });
        teardown("answer_failed");
      }
    };

    const onIce = async ({ callId, candidate }) => {
      if (callIdRef.current !== callId) return;
      await serviceRef.current?.addIceCandidate(candidate);
    };

    const onConnected = ({ callId, answeredAt }) => {
      if (callIdRef.current !== callId) return;
      patch({
        phase: CALL_PHASE.ACTIVE,
        startedAt: answeredAt ? new Date(answeredAt).getTime() : Date.now(),
      });
    };

    const onEnded = ({ callId, endReason }) => {
      if (callIdRef.current !== callId) return;
      teardown(endReason || "ended");
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:handled", onHandled);
    socket.on("call:accepted", onAccepted);
    socket.on("call:offer", onOffer);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice", onIce);
    socket.on("call:connected", onConnected);
    socket.on("call:ended", onEnded);

    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:handled", onHandled);
      socket.off("call:accepted", onAccepted);
      socket.off("call:offer", onOffer);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice", onIce);
      socket.off("call:connected", onConnected);
      socket.off("call:ended", onEnded);
    };
    // Deliberately does NOT depend on state.phase — phaseRef covers that, and
    // resubscribing mid-negotiation is how signaling events get dropped.
  }, [socket, patch, teardown]);

  // Tear down media if the provider unmounts (sign-out, app reload).
  useEffect(() => () => serviceRef.current?.destroy(), []);

  const value = useMemo(
    () => ({
      ...state,
      // Real profiles use `id`; some older code used `_id`. Accept either.
      currentUserId:
        (user?.id ?? user?._id) != null ? String(user.id ?? user._id) : null,
      isInCall: state.phase !== CALL_PHASE.IDLE,
      startCall,
      acceptCall,
      declineCall,
      cancelCall,
      endCall,
      toggleMicrophone,
      toggleCamera,
      switchCamera,
    }),
    [
      state,
      user,
      startCall,
      acceptCall,
      declineCall,
      cancelCall,
      endCall,
      toggleMicrophone,
      toggleCamera,
      switchCamera,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider.");
  }
  return context;
}

export default CallContext;
