// localpulse/app/src/screens/FollowersScreen.js
//
// Followers / following list. One screen for both, switched by route param:
//
//   navigation.navigate("Followers", { userId, username, mode })
//     mode: 'followers' | 'following'
//
// Register in RootNavigator's main branch:
//   <Stack.Screen name="Followers" component={FollowersScreen}
//                 options={{ headerShown: false }} />

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { api } from "../api/client.js";
import { useLang } from "../context/LangContext.js";
import { theme, useStyles } from "../theme/theme.js";
import ScreenHeader from "../components/ScreenHeader.js";
import { avatarSource } from "../lib/avatar.js";

export default function FollowersScreen({ route, navigation }) {
  const s = useStyles(stylesFactory);
  const { t } = useLang();

  const { userId, username, mode = "followers" } = route?.params ?? {};
  const isFollowers = mode === "followers";

  const [users, setUsers] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState(() => new Set());

  const fetchPage = useCallback(
    async (before) => {
      const fn = isFollowers ? api.getFollowers : api.getFollowing;
      const data = await fn(userId, before ? { before } : undefined);
      // Normalise here so both callers read one shape: tolerate a bare array
      // or a list keyed by its own name (followers / following).
      const users = Array.isArray(data)
        ? data
        : (data?.users ?? data?.[isFollowers ? "followers" : "following"] ?? []);
      return { users, nextBefore: data?.nextBefore ?? null };
    },
    [userId, isFollowers],
  );

  const load = useCallback(async () => {
    if (!userId) {
      setError("No user specified");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchPage(null);
      setUsers(data.users ?? []);
      setCursor(data.nextBefore ?? null);
    } catch (e) {
      setError(e?.message ?? t.somethingWrong);
    } finally {
      setLoading(false);
    }
  }, [userId, fetchPage, t]);

  useEffect(() => {
    load();
  }, [load]);

  // nextBefore is null when the server returned a partial page, which is how
  // it says "that was the last one". Guarding on loadingMore as well stops
  // onEndReached — which fires repeatedly while the list settles — from
  // issuing several requests for the same page.
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(cursor);
      setUsers((current) => [...current, ...(data.users ?? [])]);
      setCursor(data.nextBefore ?? null);
    } catch {
      // Transient. The user can pull to refresh; failing silently here beats
      // an alert covering a list they can still read.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, loading, fetchPage]);

  // Follow/unfollow from the row, optimistic. Same reasoning as the profile
  // button: waiting for the round trip makes the tap feel ignored.
  const toggleFollow = useCallback(async (target) => {
    const id = target.id ?? target._id;
    if (!id) return;

    setBusyIds((current) => new Set(current).add(id));

    const wasFollowing = target.followedByMe;
    setUsers((current) =>
      current.map((u) =>
        (u.id ?? u._id) === id ? { ...u, followedByMe: !wasFollowing } : u,
      ),
    );

    try {
      if (wasFollowing) await api.unfollow(id);
      else await api.follow(id);
    } catch {
      // Restore just this row.
      setUsers((current) =>
        current.map((u) =>
          (u.id ?? u._id) === id ? { ...u, followedByMe: wasFollowing } : u,
        ),
      );
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const renderItem = ({ item }) => {
    const id = item.id ?? item._id;
    const busy = busyIds.has(id);

    return (
      <Pressable
        style={s.row}
        onPress={() =>
          navigation.push("Profile", { username: item.username, user: item })
        }
      >
        <Image source={avatarSource(item)} style={s.avatar} />

        <View style={s.rowText}>
          <Text style={s.name} numberOfLines={1}>
            {item.displayName || item.username}
          </Text>
          {item.username ? (
            <Text style={s.handle} numberOfLines={1}>
              @{item.username}
            </Text>
          ) : null}
        </View>

        {/* No button on your own row — following yourself is not a thing, and
            the server rejects it anyway. */}
        {item.isSelf ? null : (
          <Pressable
            style={[s.followBtn, item.followedByMe && s.followingBtn]}
            onPress={() => toggleFollow(item)}
            disabled={busy}
            hitSlop={6}
          >
            <Text style={[s.followText, item.followedByMe && s.followingText]}>
              {item.followedByMe ? t.following : t.follow}
            </Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  const title = isFollowers ? t.followers : t.following;

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={username ? `${title} · @${username}` : title}
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Text style={s.empty}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id ?? item._id)}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={users.length === 0 ? s.flexEmpty : undefined}
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.empty}>
                {isFollowers ? t.noFollowers : t.noFollowing}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={s.footer}>
                <ActivityIndicator color={theme.colors.textDim} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const stylesFactory = ({ colors, radius }) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    flexEmpty: { flexGrow: 1 },
    empty: { color: colors.textDim, fontSize: 15, textAlign: "center" },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surfaceAlt,
    },
    rowText: { flex: 1 },
    name: { color: colors.text, fontSize: 16, fontWeight: "700" },
    handle: { color: colors.textDim, fontSize: 13, marginTop: 2 },

    followBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.md,
      backgroundColor: colors.accent,
      minWidth: 92,
      alignItems: "center",
    },
    followingBtn: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
    },
    followText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    followingText: { color: colors.text },

    footer: { paddingVertical: 20 },
  });
