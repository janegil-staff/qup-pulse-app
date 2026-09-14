// src/screens/MyProfileScreen.js
//
// "My Profile" — the logged-in user's own profile with inline editing, the
// email-confirmation banner, follower counts, interests, and a link into
// their private Saved posts.
//
// NOTE: `t` from useLang() is a plain object of strings, not a function.
// Access keys as t.someKey — never t('someKey').
//
// Saved posts are PRIVATE. They live here (your own profile), reached only by
// you — never shown on the public ProfileScreen that others see.
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";

import { useAuth } from "../context/AuthContext.js";
import { useLang } from "../context/LangContext.js";
import { api } from "../api/client.js";
import { theme, useStyles } from "../theme/theme.js";
import ScreenHeader from "../components/ScreenHeader.js";
import { avatarSource } from "../lib/avatar.js";
import VerifiedBadge from "../components/VerifiedBadge.js";
import InterestsEditor from "../components/InterestsEditor.js";

export default function MyProfileScreen({ navigation }) {
  const styles = useStyles(stylesFactory);
  // Live width — a module-level Dimensions.get() freezes the portrait value and
  // leaves the hero the wrong height after an iPad rotation.
  const { width } = useWindowDimensions();
  const HERO_H = Math.round(width * 1.15);
  const { t } = useLang();
  const { user, hydrate, logout } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [resending, setResending] = useState(false);

  const photos = (user?.photos || []).map((p) =>
    typeof p === "string" ? { url: p, publicId: null } : p,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await hydrate?.();
    } catch (e) {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, [hydrate]);

  function startEdit(field, currentValue) {
    setEditing(field);
    setDraft(currentValue == null ? "" : String(currentValue));
  }
  function cancelEdit() {
    setEditing(null);
    setDraft("");
  }

  async function saveField(field) {
    const value = field === "bio" ? draft : draft.trim();
    setSaving(true);
    try {
      await api.updateMyProfile({ [field]: value });
      await hydrate?.();
      setEditing(null);
      setDraft("");
    } catch (e) {
      Alert.alert(t.couldntSave, e?.message || t.somethingWrong);
    } finally {
      setSaving(false);
    }
  }

  async function resendVerification() {
    setResending(true);
    try {
      const { alreadyVerified } = await api.resendVerification();
      if (alreadyVerified) {
        await hydrate?.();
        Alert.alert("", t.alreadyConfirmed);
      } else {
        Alert.alert("", t.confirmationSent);
      }
    } catch (e) {
      Alert.alert(t.couldntSend, e?.message || t.tryAgain);
    } finally {
      setResending(false);
    }
  }

  async function addPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t.permissionTitle, t.permissionBody);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType
          ? ["images"]
          : ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setUploadingPhoto(true);
      const photo = await api.uploadImage(asset.uri);
      if (!photo?.url) throw new Error("Upload returned no URL.");
      const nextPhotos = [...photos, photo];
      await api.updateMyProfile({ photos: nextPhotos });
      await hydrate?.();
    } catch (e) {
      Alert.alert(t.uploadFailed, e?.message || t.tryAgain);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function makePrimary(index) {
    if (index === 0) return;
    const next = [...photos];
    const [pick] = next.splice(index, 1);
    next.unshift(pick);
    api
      .updateMyProfile({ photos: next })
      .then(() => hydrate?.())
      .catch(() => {});
  }

  function removePhoto(index) {
    Alert.alert(t.removePhotoTitle, t.removePhotoBody, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.remove,
        style: "destructive",
        onPress: async () => {
          const nextPhotos = photos.filter((_, i) => i !== index);
          setSaving(true);
          try {
            await api.updateMyProfile({ photos: nextPhotos });
            await hydrate?.();
          } catch (e) {
            Alert.alert(t.couldntRemove, e?.message || t.tryAgain);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  function confirmLogout() {
    Alert.alert(t.logoutConfirmTitle, t.logoutConfirmBody, [
      { text: t.cancel, style: "cancel" },
      { text: t.logout, style: "destructive", onPress: () => logout?.() },
    ]);
  }

  // Opens the same list screen the public profile uses. Requires "Followers"
  // to be registered in RootNavigator's main branch.
  function openFollowList(mode) {
    navigation.navigate("Followers", {
      userId: user?.id ?? user?._id,
      username: user?.username,
      mode, // 'followers' | 'following'
    });
  }

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const displayName = user.displayName || user.username || "You";

  return (
    <View style={styles.container}>
      <ScreenHeader title={t.myProfileTitle} navigation={navigation} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        {/* ── Hero ─────────────────────────────── */}
        <View style={[styles.hero, { height: HERO_H }]}>
          <Image source={avatarSource(user)} style={styles.heroImg} />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.75)"]}
            style={styles.heroScrim}
            pointerEvents="none"
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroName}>
              {displayName}
              {user.age ? (
                <Text style={styles.heroAge}> {user.age}</Text>
              ) : null}
            </Text>
            {user.emailVerified ? (
              <View style={styles.confirmedPill}>
                <VerifiedBadge size={13} />
                <Text style={styles.confirmedText}>
                  {t.badgeEmailConfirmed}
                </Text>
              </View>
            ) : null}
            {user.gender ? (
              <Text style={styles.heroMeta}>
                {t[`gender_${user.gender}`] || user.gender}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.heroCam}
            onPress={addPhoto}
            disabled={uploadingPhoto}
            activeOpacity={0.85}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.heroCamText}>＋</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Follower / following counts ──────── */}
        {/* Tappable, opening the same list screen the public profile uses.
            Requires GET /api/me to return followerCount and followingCount —
            toSelf() does not include them, so without that server change both
            read 0 forever. */}
        <View style={styles.stats}>
          <TouchableOpacity
            style={styles.stat}
            onPress={() => openFollowList("followers")}
            activeOpacity={0.7}
          >
            <Text style={styles.statNum}>{user.followerCount ?? 0}</Text>
            <Text style={styles.statLabel}>{t.followers}</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.stat}
            onPress={() => openFollowList("following")}
            activeOpacity={0.7}
          >
            <Text style={styles.statNum}>{user.followingCount ?? 0}</Text>
            <Text style={styles.statLabel}>{t.following}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Email confirmation ───────────────── */}
        {/* Matches the web (qup-pulse-admin) verify card: amber-tinted surface
            with an amber border, a mail-icon chip, title + muted body, and a
            solid amber "resend" button. */}
        {!user.emailVerified && (
          <View style={styles.verifyCard}>
            <View style={styles.verifyIcon}>
              <Text style={styles.verifyIconGlyph}>✉</Text>
            </View>
            <View style={styles.verifyTextCol}>
              <Text style={styles.verifyTitle}>{t.verifyTitle}</Text>
              <Text style={styles.verifyBody}>{t.verifyBody}</Text>
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={!resending ? resendVerification : undefined}
                disabled={resending}
                activeOpacity={0.85}
              >
                {resending ? (
                  <ActivityIndicator size="small" color="#3a2500" />
                ) : (
                  <Text style={styles.verifyBtnText}>{t.verifyResend}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Photo gallery ────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t.photosLabel}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -4 }}
          >
            {photos.map((photo, i) => (
              <View
                key={`${photo.url}-${i}`}
                style={[styles.thumbWrap, i === 0 && styles.thumbPrimary]}
              >
                <TouchableOpacity
                  onPress={() => makePrimary(i)}
                  activeOpacity={0.8}
                  style={styles.thumbTouch}
                >
                  <Image source={{ uri: photo.url }} style={styles.thumb} />
                  {i === 0 && (
                    <View style={styles.primaryTag}>
                      <Text style={styles.primaryTagText}>{t.mainPhoto}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.thumbRemove}
                  onPress={() => removePhoto(i)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.thumbRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < 6 && (
              <TouchableOpacity
                style={styles.thumbAdd}
                onPress={addPhoto}
                disabled={uploadingPhoto}
                activeOpacity={0.8}
              >
                <Text style={styles.thumbAddPlus}>＋</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          {photos.length > 1 && <Text style={styles.hint}>{t.photoHint}</Text>}
        </View>

        {/* ── About ────────────────────────────── */}
        <View style={styles.card}>
          <EditableRow
            label={t.bioLabel}
            value={user.bio}
            editing={editing === "bio"}
            draft={draft}
            setDraft={setDraft}
            saving={saving}
            onStart={() => startEdit("bio", user.bio)}
            onCancel={cancelEdit}
            onSave={() => saveField("bio")}
            multiline
            placeholder={t.bioPlaceholder}
          />
        </View>

        {/* ── Interests ────────────────────────── */}
        {/* Inside the ScrollView, in a card like every other section. It was
            previously a sibling of the ScrollView, which pinned it to the
            bottom of the screen on top of the content instead of placing it
            in the flow. */}
        <View style={styles.card}>
          <InterestsEditor />
        </View>

        {/* ── Saved posts (private, this user only) ── */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.savedRow}
            onPress={() => navigation.navigate("Saved")}
            activeOpacity={0.7}
          >
            <View style={styles.savedRowLeft}>
              <Text style={styles.savedIcon}>🔖</Text>
              <Text style={styles.savedRowText}>{t.savedPosts}</Text>
            </View>
            <Text style={styles.savedChevron}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={confirmLogout}
          activeOpacity={0.85}
        >
          <Text style={styles.logoutText}>{t.logout}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function EditableRow({
  label,
  value,
  editing,
  draft,
  setDraft,
  saving,
  onStart,
  onCancel,
  onSave,
  multiline,
  placeholder,
  autoCapitalize = "sentences",
  keyboardType = "default",
}) {
  const styles = useStyles(stylesFactory);
  const { t } = useLang();
  return (
    <View>
      <View style={styles.rowHeader}>
        <Text style={styles.cardLabel}>{label}</Text>
        {!editing && (
          <TouchableOpacity onPress={onStart}>
            <Text style={styles.editLink}>{t.edit}</Text>
          </TouchableOpacity>
        )}
      </View>
      {editing ? (
        <View>
          <TextInput
            style={[styles.input, multiline && styles.inputMultiline]}
            value={draft}
            onChangeText={setDraft}
            multiline={multiline}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textDim}
            autoCapitalize={autoCapitalize}
            keyboardType={keyboardType}
            selectionColor={theme.colors.accent}
            autoFocus
          />
          <View style={styles.editActions}>
            <TouchableOpacity onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelLink}>{t.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>{t.save}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.value}>{value || "\u2014"}</Text>
      )}
    </View>
  );
}

const stylesFactory = ({ colors }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    centered: { alignItems: "center", justifyContent: "center" },

    hero: {
      width: "100%",
      position: "relative",
      backgroundColor: colors.surface,
    },
    heroImg: { width: "100%", height: "100%" },
    heroScrim: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "55%",
      backgroundColor: "transparent",
    },
    heroContent: { position: "absolute", left: 20, bottom: 18, right: 80 },
    heroName: {
      color: "#fff",
      fontSize: 30,
      fontWeight: "800",
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowRadius: 6,
      textShadowOffset: { width: 0, height: 1 },
    },
    heroAge: { color: "#fff", fontSize: 26, fontWeight: "400" },
    heroMeta: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 15,
      marginTop: 2,
      textTransform: "capitalize",
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowRadius: 6,
    },

    confirmedPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      backgroundColor: "rgba(0,0,0,0.45)",
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 8,
    },
    confirmedText: { color: "#fff", fontSize: 12, fontWeight: "600" },

    heroCam: {
      position: "absolute",
      right: 18,
      bottom: 18,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    heroCamText: {
      color: "#fff",
      fontSize: 30,
      fontWeight: "300",
      marginTop: -2,
    },

    // Follower / following. Same shape as the public ProfileScreen so the two
    // read as the same app.
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

    // Amber verify card matching the web (qup-pulse-admin) design: tinted
    // translucent amber surface, amber border, mail-icon chip, and a solid amber
    // resend button. Colors are literals (not theme tokens) so the amber reads
    // the same in light and dark mode, as it does on the web.
    verifyCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
      backgroundColor: "rgba(245, 158, 11, 0.12)",
      borderWidth: 1,
      borderColor: "rgba(245, 158, 11, 0.35)",
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 18,
    },
    verifyIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "rgba(245, 158, 11, 0.20)",
      alignItems: "center",
      justifyContent: "center",
    },
    verifyIconGlyph: { color: "#f59e0b", fontSize: 20 },
    verifyTextCol: { flex: 1 },
    verifyTitle: { color: "#f59e0b", fontSize: 17, fontWeight: "800" },
    verifyBody: {
      color: colors.textDim,
      fontSize: 14,
      marginTop: 6,
      lineHeight: 20,
    },
    verifyBtn: {
      alignSelf: "flex-start",
      backgroundColor: "#f59e0b",
      borderRadius: 10,
      marginTop: 14,
      paddingHorizontal: 18,
      paddingVertical: 11,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    verifyBtnText: { color: "#3a2500", fontSize: 15, fontWeight: "800" },

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
    },
    rowHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    value: { color: colors.text, fontSize: 17, marginTop: 6 },
    editLink: { color: colors.accent, fontSize: 14, fontWeight: "700" },
    hint: { color: colors.textDim, fontSize: 12, marginTop: 10 },

    savedRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    savedRowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    savedIcon: { fontSize: 18 },
    savedRowText: { color: colors.text, fontSize: 16, fontWeight: "600" },
    savedChevron: { color: colors.textDim, fontSize: 24, fontWeight: "300" },

    thumbWrap: {
      width: 84,
      height: 84,
      borderRadius: 14,
      marginHorizontal: 4,
      marginTop: 12,
      position: "relative",
    },
    thumbTouch: { width: "100%", height: "100%", borderRadius: 14 },
    thumbPrimary: { borderWidth: 2, borderColor: colors.accent },
    thumb: { width: "100%", height: "100%", borderRadius: 14 },
    primaryTag: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.accent,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      alignItems: "center",
      paddingVertical: 2,
    },
    primaryTagText: { color: "#fff", fontSize: 10, fontWeight: "800" },
    thumbRemove: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.text,
      alignItems: "center",
      justifyContent: "center",
    },
    thumbRemoveText: {
      color: colors.bg,
      fontSize: 15,
      lineHeight: 17,
      fontWeight: "800",
    },
    thumbAdd: {
      width: 84,
      height: 84,
      borderRadius: 14,
      marginHorizontal: 4,
      marginTop: 12,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    thumbAddPlus: { color: colors.accent, fontSize: 30, fontWeight: "300" },

    input: {
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.bg,
      marginTop: 10,
    },
    inputMultiline: { height: 110, textAlignVertical: "top" },
    editActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      marginTop: 12,
    },
    cancelLink: { color: colors.textDim, fontSize: 14, marginRight: 20 },
    saveButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 22,
      paddingVertical: 9,
      borderRadius: 10,
      minWidth: 78,
      alignItems: "center",
    },
    saveButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },

    logoutButton: {
      marginHorizontal: 16,
      marginTop: 24,
      paddingVertical: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.danger,
      alignItems: "center",
    },
    logoutText: { color: colors.danger, fontSize: 16, fontWeight: "700" },
  });
