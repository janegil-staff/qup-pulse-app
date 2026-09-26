// src/screens/ProfileScreen.js
// Public profile — view another user. Hero photo gallery, info sections,
// online status, and Follow / Message / Report / Block actions.
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../api/client.js";
import { theme, useStyles } from "../theme/theme.js";
import ScreenHeader from "../components/ScreenHeader.js";
import { avatarSource } from "../lib/avatar.js";
import VerifiedBadge from "../components/VerifiedBadge.js";
import { useLang } from "../context/LangContext.js";
import ReportSheet from "../components/ReportSheet.js";
import PostCard from "../components/PostCard.js";
import InterestChips from "../components/InterestChips.js";
import useFollow from "../hooks/useFollow.js";

export default function ProfileScreen({ route, navigation }) {
  const styles = useStyles(stylesFactory);
  // Read live: Dimensions.get() at module scope freezes the portrait width and
  // the hero carousel then pages against a stale page width after an iPad
  // rotation. useWindowDimensions re-renders on every size change.
  const { width } = useWindowDimensions();
  const HERO_H = Math.round(width * 1.1);
  const username = route?.params?.username;
  const { t } = useLang();
  const [profile, setProfile] = useState(route?.params?.user ?? null);
  const [loading, setLoading] = useState(!route?.params?.user);
  const [error, setError] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [posts, setPosts] = useState(route?.params?.user?.posts ?? []);
  const scrollRef = useRef(null);

  const userId = profile?.id ?? profile?._id;

  // Follow state, optimistic. Hooks cannot be called conditionally, so this
  // runs even while `profile` is null — hence the ?. throughout. The hook
  // no-ops without a userId and re-seeds from the props when the profile
  // arrives, so an early render costs nothing.
  //
  // `followedByMe` is the field the API returns. isFollowing is accepted as a
  // fallback in case the shape differs between the discovery card and the
  // full profile.
  const {
    following,
    followerCount,
    busy: followBusy,
    toggle: toggleFollow,
  } = useFollow({
    userId,
    initialFollowing: profile?.followedByMe ?? profile?.isFollowing ?? false,
    initialFollowerCount: profile?.followerCount ?? 0,
    followFn: api.follow,
    unfollowFn: api.unfollow,
  });

  const load = useCallback(async () => {
    // Discovery may navigate with only a `user` object, no separate `username`
    // param — fall back to the username carried on that object so we can still
    // fetch the full profile (which brings followerCount/followingCount + posts).
    const handle = username || route?.params?.user?.username;
    if (!handle) {
      setError("No user specified");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.getProfile(handle);
      setProfile(data.profile ?? data.user ?? data);
      // getProfile returns the author's recent posts alongside the profile.
      if (Array.isArray(data.posts)) setPosts(data.posts);
    } catch (e) {
      setError(e?.message ?? "Could not load profile");
    } finally {
      setLoading(false);
    }
  }, [username, route?.params?.user?.username]);

  // Always fetch the full profile when we have a username. A route-param `user`
  // (from feed or Discovery) is only a fast first paint and may lack fields the
  // full profile carries — notably followerCount/followingCount and posts. So
  // refetch unless we already hold a complete profile (photos + counts present).
  useEffect(() => {
    const complete = profile && profile.photos && profile.followerCount != null;
    if (!complete) load();
  }, [load, profile]);

  // Follow failures surface here rather than inside the hook: the hook owns
  // the state and the rollback, the screen owns how the user is told.
  async function onFollowPress() {
    try {
      await toggleFollow();
    } catch (e) {
      Alert.alert(t.error || "Error", e?.message || t.tryAgain || "Try again.");
    }
  }

  async function message() {
    try {
      const convo = await api.openConversation(userId);
      navigation.navigate("Chat", {
        conversationId: convo.conversationId ?? convo.id ?? convo._id,
        title: profile?.displayName || profile?.username,
      });
    } catch (e) {
      Alert.alert("Could not open chat", e?.message ?? "Try again.");
    }
  }

  function confirmBlock() {
    Alert.alert(
      "Block user",
      `Block ${profile?.displayName || profile?.username}? They won't be able to see you or message you.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await api.blockUser(userId);
              Alert.alert("Blocked", "You will no longer see this person.", [
                { text: "OK", onPress: () => navigation.goBack() },
              ]);
            } catch (e) {
              Alert.alert("Error", e?.message ?? "Could not block.");
            }
          },
        },
      ],
    );
  }

  // Submit handler for the report sheet. Receives the enum reason key and the
  // optional note; the sheet owns the UI and reason selection.
  async function submitReport(reason, note) {
    try {
      await api.reportUser(userId, reason, note); // enum key + optional note
      setReportOpen(false);
      Alert.alert(
        t.reportThanksTitle || "Reported",
        t.reportThanks || "Thanks — our team will review this profile.",
      );
    } catch (e) {
      Alert.alert(
        t.error || "Error",
        e?.message ?? t.couldntSend ?? "Could not send report.",
      );
    }
  }

  function moreActions() {
    Alert.alert(
      profile?.displayName || profile?.username || "User",
      undefined,
      [
        { text: "Report", onPress: () => setReportOpen(true) },
        { text: "Block", style: "destructive", onPress: confirmBlock },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </View>
    );
  }
  if (error || !profile) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || "Profile not found"}</Text>
        </View>
      </View>
    );
  }

  // Photos are { url, publicId } objects. Guard against a bare string anyway:
  // this screen can be handed a `user` object via route params from Discover,
  // and an older cached one may still hold the flat form.
  const photos = (profile.photos || []).map((p) =>
    typeof p === "string" ? { url: p } : p,
  );
  const name = profile.displayName || profile.username || "Someone";

  function onPhotoScroll(e) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== photoIndex) setPhotoIndex(i);
  }

  // Like a post from the profile list. Optimistic local update — this screen
  // isn't backed by the feed store, so we toggle the post in local state and
  // call the API. Reverts if the request fails.
  async function likePost(postId) {
    setPosts((list) =>
      list.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByMe: !p.likedByMe,
              likeCount: p.likeCount + (p.likedByMe ? -1 : 1),
            }
          : p,
      ),
    );
    try {
      await api.toggleLike(postId);
    } catch {
      setPosts((list) =>
        list.map((p) =>
          p.id === postId
            ? {
                ...p,
                likedByMe: !p.likedByMe,
                likeCount: p.likeCount + (p.likedByMe ? -1 : 1),
              }
            : p,
        ),
      );
    }
  }

  function openPost(post) {
    navigation.navigate("PostDetail", { post });
  }

  // Tapping a count opens the list. REGISTER "Followers" IN RootNavigator
  // BEFORE SHIPPING — navigating to an unregistered route throws.
  function openFollowList(mode) {
    navigation.navigate("Followers", {
      userId,
      username: profile.username,
      mode, // 'followers' | 'following'
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={profile.username || "Profile"}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero gallery */}
        <View style={[styles.hero, { width, height: HERO_H }]}>
          {photos.length > 0 ? (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onPhotoScroll}
              scrollEventThrottle={16}
            >
              {photos.map((photo, i) => (
                <Image
                  key={`${photo.url}-${i}`}
                  source={{ uri: photo.url }}
                  style={[styles.heroImg, { width, height: HERO_H }]}
                />
              ))}
            </ScrollView>
          ) : (
            <Image
              source={avatarSource(profile)}
              style={[styles.heroImg, { width, height: HERO_H }]}
            />
          )}

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.8)"]}
            style={styles.heroScrim}
            pointerEvents="none"
          />

          {/* photo dots */}
          {photos.length > 1 && (
            <View style={styles.dots}>
              {photos.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === photoIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}

          {/* name + email badge + online */}
          <View style={styles.heroContent}>
            <View style={styles.nameRow}>
              <Text style={styles.heroName}>
                {name}
                {profile.age ? (
                  <Text style={styles.heroAge}> {profile.age}</Text>
                ) : null}
              </Text>
              {/* VERIFIED_BADGE_V1 — envelope, not a checkmark. Confirming an
                  inbox proves control of an email address, not identity. */}
              {profile.emailVerified ? <VerifiedBadge size={22} /> : null}
              {profile.online ? (
                <View style={styles.onlinePill}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineText}>Online</Text>
                </View>
              ) : null}
            </View>
            {/* Location / distance intentionally not shown to other users
                (App Review 5.1.2(i)). */}
          </View>
        </View>

        {/* Actions — Message / Follow / More (report + block), placed above the
            follower/following counts. */}
        <View style={styles.actions}>
          <Pressable style={styles.messageBtn} onPress={message}>
            <Text style={styles.messageText}>Message</Text>
          </Pressable>
          <Pressable
            style={[styles.followBtn, following && styles.followingBtn]}
            onPress={onFollowPress}
            disabled={followBusy}
          >
            <Text
              style={[styles.followText, following && styles.followingText]}
            >
              {following ? t.following || "Following" : t.follow || "Follow"}
            </Text>
          </Pressable>
          <Pressable style={styles.moreBtn} onPress={moreActions}>
            <Text style={styles.moreText}>•••</Text>
          </Pressable>
        </View>

        {/* Follower / following counts.
            followerCount comes from the follow hook, NOT from `profile`, so it
            moves the instant the button is tapped. Reading profile.followerCount
            here would leave the number stale until the next full refetch —
            which is what made the button feel like it had done nothing. */}
        <View style={styles.stats}>
          <Pressable
            style={styles.stat}
            onPress={() => openFollowList("followers")}
          >
            <Text style={styles.statNum}>{followerCount}</Text>
            <Text style={styles.statLabel}>{t.followers || "Followers"}</Text>
          </Pressable>
          <View style={styles.statDivider} />
          <Pressable
            style={styles.stat}
            onPress={() => openFollowList("following")}
          >
            <Text style={styles.statNum}>{profile.followingCount ?? 0}</Text>
            <Text style={styles.statLabel}>{t.following || "Following"}</Text>
          </Pressable>
        </View>

        {/* About */}
        {profile.bio ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>About</Text>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        ) : null}

        {/* Neighborhood — self-authored "local flavor", shown when present. */}
        {profile.neighborhood ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              {t.neighborhoodLabel || "Neighborhood"}
            </Text>
            <Text style={styles.bio}>{profile.neighborhood}</Text>
          </View>
        ) : null}

        {/* Interests. Rendered through InterestChips so the labels are
            translated — the stored values are ids ("hiking"), not display
            text, so mapping them raw showed English to every locale. The
            component returns null when the list is empty, so the card is
            only mounted when there is something in it. */}
        {Array.isArray(profile.interests) && profile.interests.length > 0 ? (
          <View style={styles.card}>
            <InterestChips interests={profile.interests} showLabel={false} />
          </View>
        ) : null}

        {/* Posts — everything this user has written (most recent first).
            Reuses PostCard; tapping a card opens the post. Save/report/author
            actions are omitted since this is already the author's profile. */}
        {posts.length > 0 ? (
          <View style={styles.postsSection}>
            <Text style={styles.postsLabel}>{t.postsLabel || "Posts"}</Text>
            {posts.map((p) => (
              <PostCard
                key={String(p.id)}
                post={p}
                onLike={likePost}
                onPress={() => openPost(p)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport}
        title={t.reportUserTitle || "Report user"}
        prompt={t.reportWhy || "Why are you reporting this profile?"}
      />
    </View>
  );
}

const stylesFactory = ({ colors, spacing, radius }) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing(8),
    },
    errorText: { color: colors.textDim, fontSize: 15, textAlign: "center" },

    hero: {
      position: "relative",
      backgroundColor: colors.surface,
    },
    heroImg: {},
    heroEmpty: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceAlt,
    },
    heroEmptyText: { color: colors.textDim, fontSize: 88, fontWeight: "800" },
    heroScrim: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "45%",
    },

    dots: {
      position: "absolute",
      top: 14,
      alignSelf: "center",
      flexDirection: "row",
      gap: 6,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "rgba(255,255,255,0.5)",
    },
    dotActive: { backgroundColor: "#fff", width: 18 },

    heroContent: { position: "absolute", left: 20, right: 20, bottom: 18 },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
    },
    heroName: {
      color: "#fff",
      fontSize: 30,
      fontWeight: "800",
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowRadius: 6,
    },
    heroAge: { color: "#fff", fontSize: 26, fontWeight: "400" },
    heroMeta: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 15,
      marginTop: 4,
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowRadius: 6,
    },
    onlinePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(0,0,0,0.45)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    onlineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#3BD16F",
    },
    onlineText: { color: "#fff", fontSize: 12, fontWeight: "600" },

    stats: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: 16,
      marginTop: 16,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stat: { flex: 1, alignItems: "center" },
    statNum: { color: colors.text, fontSize: 20, fontWeight: "800" },
    statLabel: {
      color: colors.textDim,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 2,
    },
    statDivider: { width: 1, height: 32, backgroundColor: colors.border },

    card: {
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardLabel: {
      color: colors.textDim,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    bio: { color: colors.text, fontSize: 16, lineHeight: 23 },

    // Posts list. PostCard supplies its own horizontal margins, so the section
    // only owns the top spacing and the section label (aligned to the cards).
    postsSection: { marginTop: 24 },
    postsLabel: {
      color: colors.textDim,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginHorizontal: 16,
      marginBottom: 4,
    },

    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 16,
      marginTop: 24,
    },
    messageBtn: {
      flex: 1,
      height: 54,
      borderRadius: radius.md,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    messageText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    followBtn: {
      paddingHorizontal: 18,
      height: 54,
      borderRadius: radius.md,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    followingBtn: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
    },
    followText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    followingText: { color: colors.text },
    moreBtn: {
      width: 54,
      height: 54,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    moreText: { color: colors.textDim, fontSize: 20, fontWeight: "700" },
  });
