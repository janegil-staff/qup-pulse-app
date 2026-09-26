// src/screens/DiscoveryScreen.js
// People nearby — a grid of users. Tap a card to open their profile (where you
// can Message / Report / Block). Replaces the old swipe deck.
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import * as Location from "expo-location";
import { api } from "../api/client.js";
import { theme, useStyles } from "../theme/theme.js";
import ScreenHeader from "../components/ScreenHeader.js";
import { avatarSource } from "../lib/avatar.js";
import VerifiedBadge from "../components/VerifiedBadge.js";
import { useLang } from "../context/LangContext.js";
import ProfilePrompt from "../components/ProfilePrompt.js";
const GAP = 8;
const COLS = 3;

export default function DiscoveryScreen({ navigation }) {
  const styles = useStyles(stylesFactory);
  // Grid maths from the live window width. Taken once at module scope it keeps
  // the portrait card width after an iPad rotation, leaving a three-column grid
  // sized for a phone sitting in the top-left of a landscape iPad.
  const { width } = useWindowDimensions();
  const CARD_W = (width - GAP * (COLS + 1)) / COLS;
  const { t, lang, setLang } = useLang();

  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  // Where these results are centred. null → the viewer's own location.
  const [browsingFrom, setBrowsingFrom] = useState(null);
  const [browsingElsewhere, setBrowsingElsewhere] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      // Push a fresh location so results are geo-accurate, then fetch.
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          await api.updateLocation(pos.coords.longitude, pos.coords.latitude);
        }
      } catch {
        /* proceed without fresh location */
      }

      const data = await api.getDiscovery();
      // Accept a few possible shapes: { users }, { people }, { deck }, or a bare array.
      const list =
        data.users ??
        data.people ??
        data.deck ??
        (Array.isArray(data) ? data : []);

      // TEMP — remove once the badge is confirmed working. If this logs
      // `undefined`, the server is not projecting the field and the badge
      // can never render.
      if (list[0])
        console.log("[Discovery] emailVerified:", list[0].emailVerified);

      setPeople(list);
      setBrowsingFrom(data.browsingFrom ?? null);
      setBrowsingElsewhere(Boolean(data.browsingElsewhere));
    } catch (e) {
      setError(e?.message ?? "Could not load people nearby");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The picker changes the browse area on the server, so refresh on return.
  useEffect(() => navigation.addListener("focus", load), [navigation, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  async function browseNearMeAgain() {
    setLoading(true);
    try {
      await api.setBrowseLocation({ clear: true });
    } catch {
      /* fall through to reload anyway */
    }
    load();
  }

  function openProfile(person) {
    navigation.navigate("Profile", { username: person.username, user: person });
  }

  function renderCard({ item }) {
    const name = item.displayName || item.username || "Someone";
    return (
      <Pressable
        style={[styles.card, { width: CARD_W }]}
        onPress={() => openProfile(item)}
      >
        <Image source={avatarSource(item)} style={styles.photo} />
        {item.emailVerified ? (
          <View style={[styles.verifiedPill, { maxWidth: CARD_W - 32 }]}>
            <VerifiedBadge size={10} />
            <Text style={styles.verifiedPillText} numberOfLines={1}>
              {t.badgeEmailConfirmed}
            </Text>
          </View>
        ) : null}
        <View style={styles.label}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
            {item.age ? `, ${item.age}` : ""}
          </Text>
          {item.distanceKm != null ? (
            <Text style={styles.meta} numberOfLines={1}>
              ~{item.distanceKm} km
            </Text>
          ) : null}
        </View>
        {item.online ? <View style={styles.onlineDot} /> : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={browsingFrom || "Discover"}
        subtitle={browsingElsewhere ? "Browsing another area" : undefined}
        navigation={navigation}
        onTitlePress={() =>
          navigation.navigate("LocationPicker", { mode: "browse" })
        }
      />
      <ProfilePrompt />
      {browsingElsewhere ? (
        <Pressable style={styles.banner} onPress={browseNearMeAgain}>
          <Text style={styles.bannerText}>Browse near me again</Text>
        </Pressable>
      ) : null}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => String(item.id ?? item._id ?? item.username)}
          renderItem={renderCard}
          numColumns={COLS}
          columnWrapperStyle={{ paddingHorizontal: GAP, gap: GAP }}
          contentContainerStyle={{
            paddingTop: GAP,
            paddingBottom: 32,
            gap: GAP,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ||
                "No one nearby yet. Pull to refresh, or widen your distance in Settings."}
            </Text>
          }
        />
      )}
    </View>
  );
}

const stylesFactory = ({ colors, radius }) =>
  StyleSheet.create({
    verifiedPill: {
      position: "absolute",
      top: 6,
      left: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 11,
      paddingHorizontal: 5,
      paddingVertical: 3,
    },
    verifiedPillText: {
      color: "#fff",
      fontSize: 9,
      fontWeight: "700",
      flexShrink: 1,
    },
    root: { flex: 1, backgroundColor: colors.bg },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    banner: {
      backgroundColor: colors.surfaceAlt,
      paddingVertical: 10,
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    bannerText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
    card: {
      aspectRatio: 1,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    photo: { width: "100%", height: "100%" },
    noPhoto: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceAlt,
    },
    noPhotoText: { color: colors.textDim, fontSize: 34, fontWeight: "800" },
    label: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 6,
      paddingVertical: 5,
      backgroundColor: "#000000aa",
    },
    onlineDot: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: "#3BD16F",
      borderWidth: 2,
      borderColor: "#fff",
    },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    name: { color: "#fff", fontSize: 12, fontWeight: "700", flexShrink: 1 },
    meta: { color: "rgba(255,255,255,0.85)", fontSize: 10, marginTop: 1 },
    empty: {
      color: colors.textDim,
      textAlign: "center",
      marginTop: 80,
      paddingHorizontal: 40,
      lineHeight: 22,
    },
  });
