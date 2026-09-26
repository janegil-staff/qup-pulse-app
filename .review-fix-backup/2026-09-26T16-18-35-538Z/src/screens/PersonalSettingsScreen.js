// localpulse/app/src/screens/PersonalSettingsScreen.js
//
// Account identity (username, gender, date of birth, email, home location,
// language) and Discovery preferences. Split out of SettingsScreen, which was
// getting long.
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  TextInput,
  StatusBar,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api/client.js";
import { useProfileStore } from "../store/profileStore.js";
import { useLang } from "../context/LangContext.js";
import { SUPPORTED_LANGS } from "../i18n/translations.js";
import { theme, useStyles } from "../theme/theme.js";
import ScreenHeader from "../components/ScreenHeader.js";
import {
  Row,
  ToggleRow,
  Section,
  settingsStyles,
} from "../components/SettingsRows.js";
import DobEditor from "../components/DobEditor.js";

// Fallback radius when the user turns "Anywhere" back off. The server-side
// default is now null (Anywhere); this is only what we write when they opt out.
const DEFAULT_DISTANCE_KM = 50;

// Own gender — a field on the User model, not a preference. Order matches the
// `GENDERS` enum in models/User.js. All four values, including 'nonbinary'.
// `labelKey` points at the locale entry; the raw enum value is never shown.
const GENDER = [
  { key: "male", labelKey: "gender_male" },
  { key: "female", labelKey: "gender_female" },
  { key: "nonbinary", labelKey: "gender_nonbinary" },
  { key: "other", labelKey: "gender_other" },
];

// The discovery filter. `key` is the DB value that gendersFor() expects, and
// must match the ORIENT_SHOW enum on the User model — 'female'/'male', NOT
// 'women'/'men', or the save fails validation. `labelKey` is what shows.
// Note 'nonbinary' has no filter option: anyone with that gender is only
// reachable via "Everyone".
const SHOW = [
  { key: "female", labelKey: "women" },
  { key: "male", labelKey: "men" },
  { key: "everyone", labelKey: "everyone" },
];

// Native language names, keyed by the SUPPORTED_LANGS codes. Shown in their own
// language so a user who's landed in the wrong locale can still find theirs.
const LANG_NAMES = {
  no: "Norsk",
  en: "English",
  nl: "Nederlands",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  sv: "Svenska",
  da: "Dansk",
  fi: "Suomi",
  es: "Español",
  pl: "Polski",
  pt: "Português",
};

export default function PersonalSettingsScreen({ navigation }) {
  const styles = useStyles(settingsStyles);
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useLang();
  const profile = useProfileStore((s) => s.profile);
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const savePreferences = useProfileStore((s) => s.savePreferences);

  const [show, setShow] = useState("everyone");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("99");
  // null = "Anywhere" (no distance limit). Otherwise the km value as a string,
  // because that's what TextInput needs.
  const [distance, setDistance] = useState(null);
  const anywhere = distance === null;

  // Inline username edit
  const [usernameModal, setUsernameModal] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  // Inline gender edit
  const [genderEditing, setGenderEditing] = useState(false);
  const [genderSaving, setGenderSaving] = useState(false);

  // Language picker
  const [langModal, setLangModal] = useState(false);
  const [langSaving, setLangSaving] = useState(false);

  const [resending, setResending] = useState(false);

  // onBlur never fires when the screen unmounts, so the last edit to a
  // TextInput is lost on back. This ref lets the beforeRemove listener read
  // the current drafts without re-subscribing on every keystroke.
  const draftsRef = useRef({ ageMin, ageMax, distance });
  draftsRef.current = { ageMin, ageMax, distance };

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Refetch on focus: returning from LocationPicker changes locationName /
  // locationMode on the server, and the row below reads them.
  useEffect(
    () => navigation.addListener("focus", loadProfile),
    [navigation, loadProfile],
  );

  useEffect(() => {
    if (profile?.preferences) {
      const p = profile.preferences;
      setShow(p.show || "everyone");
      setAgeMin(String(p.ageMin ?? 18));
      setAgeMax(String(p.ageMax ?? 99));
      setDistance(p.maxDistanceKm == null ? null : String(p.maxDistanceKm));
    }
  }, [profile]);

  // Flush pending TextInput edits before the screen goes away — beforeRemove
  // fires while still mounted, and covers gestures and hardware back too.
  // Compares against the loaded profile so we don't POST on every back-press.
  // Calls savePreferences directly rather than savePrefs: an Alert on failure
  // would fire against a screen that no longer exists.
  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        const p = profile?.preferences;
        if (!p) return;
        const { ageMin: a, ageMax: b, distance: d } = draftsRef.current;

        const patch = {};
        const nMin = Number(a);
        const nMax = Number(b);
        if (Number.isFinite(nMin) && nMin !== p.ageMin) patch.ageMin = nMin;
        if (Number.isFinite(nMax) && nMax !== p.ageMax) patch.ageMax = nMax;

        // d === null means Anywhere, which the toggle already saved.
        if (d !== null) {
          const nDist = Number(d);
          if (
            Number.isFinite(nDist) &&
            nDist >= 1 &&
            nDist !== p.maxDistanceKm
          ) {
            patch.maxDistanceKm = nDist;
          }
        }

        if (Object.keys(patch).length) savePreferences(patch).catch(() => {});
      }),
    [navigation, profile, savePreferences],
  );

  function openUsernameEdit() {
    setUsernameDraft(profile?.username || "");
    setUsernameError("");
    setUsernameModal(true);
  }

  async function saveUsername() {
    const uname = usernameDraft.trim();
    setUsernameError("");
    if (uname.length < 3 || uname.length > 24) {
      setUsernameError(
        t.usernameLength || "Username must be 3 to 24 characters.",
      );
      return;
    }
    if (uname === profile?.username) {
      setUsernameModal(false);
      return;
    }
    setUsernameSaving(true);
    try {
      await api.updateMyProfile({ username: uname });
      await loadProfile();
      setUsernameModal(false);
    } catch (e) {
      setUsernameError(
        e?.message ?? t.couldNotChangeUsername ?? "Could not change username.",
      );
    } finally {
      setUsernameSaving(false);
    }
  }

  // Gender lives on the profile, not in preferences — so this goes through
  // updateMyProfile and needs an explicit reload, unlike the savePrefs rows.
  async function saveGender(value) {
    setGenderSaving(true);
    try {
      await api.updateMyProfile({ gender: value });
      await loadProfile();
      setGenderEditing(false);
    } catch (e) {
      Alert.alert(t.error || "Error", e?.message ?? "Could not change gender.");
    } finally {
      setGenderSaving(false);
    }
  }

  // Language is client-side only — setLang updates context and persists.
  // We don't round-trip the server: locale is a device preference here, and
  // the onboarding step writes it at signup for email templates separately.
  async function selectLang(code) {
    if (code === lang) {
      setLangModal(false);
      return;
    }
    setLangSaving(true);
    try {
      await setLang(code);
      setLangModal(false);
    } catch (e) {
      Alert.alert(
        t.error || "Error",
        t.couldNotChangeLanguage || "Could not change language.",
      );
    } finally {
      setLangSaving(false);
    }
  }

  // Resend the confirmation email. The server throttles this; the button stays
  // enabled either way, since a silently-swallowed tap is worse than a stale
  // "sent" message.
  async function resendVerification() {
    setResending(true);
    try {
      const { alreadyVerified } = await api.resendVerification();
      Alert.alert(
        "",
        alreadyVerified
          ? t.alreadyConfirmed || "Your email is already confirmed."
          : t.confirmationSent || "Confirmation email sent.",
      );
      if (alreadyVerified) loadProfile();
    } catch (e) {
      Alert.alert(
        t.error || "Error",
        e?.message ?? "Could not send the email.",
      );
    } finally {
      setResending(false);
    }
  }

  async function savePrefs(patch) {
    try {
      await savePreferences(patch);
    } catch (e) {
      Alert.alert(t.error || "Error", e.message);
    }
  }

  // Toggling "Anywhere" writes null (no limit) or restores the default radius.
  // Sending null rather than 0 keeps the meaning explicit in the DB and lets
  // $geoNear omit maxDistance entirely.
  function toggleAnywhere(on) {
    if (on) {
      setDistance(null);
      savePrefs({ maxDistanceKm: null });
    } else {
      setDistance(String(DEFAULT_DISTANCE_KM));
      savePrefs({ maxDistanceKm: DEFAULT_DISTANCE_KM });
    }
  }

  // Guard the blur handler: an empty or nonsense field would send NaN, which
  // Mongoose casts to a validation error rather than silently ignoring.
  function saveDistance() {
    const n = Number(distance);
    if (!Number.isFinite(n) || n < 1) {
      setDistance(
        String(profile?.preferences?.maxDistanceKm ?? DEFAULT_DISTANCE_KM),
      );
      return;
    }
    savePrefs({ maxDistanceKm: n });
  }

  // Same guard as saveDistance: an empty field is Number('') === 0, not
  // "unchanged", so it would silently write ageMin: 0.
  function saveAge(which, raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 18 || n > 120) {
      const fallback = String(
        profile?.preferences?.[which] ?? (which === "ageMin" ? 18 : 99),
      );
      if (which === "ageMin") setAgeMin(fallback);
      else setAgeMax(fallback);
      return;
    }
    savePrefs({ [which]: n });
  }

  function cycleShow() {
    const idx = SHOW.findIndex((option) => option.key === show);
    const next = SHOW[(idx + 1) % SHOW.length];
    setShow(next.key);
    savePrefs({ show: next.key });
  }

  const showOption = SHOW.find((option) => option.key === show) ?? SHOW[2];
  const showLabel = t[showOption.labelKey];
  const genderLabel = profile?.gender
    ? t[`gender_${profile.gender}`] || profile.gender
    : "—";
  const langLabel = LANG_NAMES[lang] || lang?.toUpperCase() || "—";

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <ScreenHeader
        title={t.personalSettings || "Personal settings"}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.root}
        contentContainerStyle={{
          padding: theme.spacing(4),
          paddingBottom: insets.bottom + theme.spacing(10),
        }}
      >
        {/* Account */}
        <Section title={t.sectionAccount || "ACCOUNT"}>
          <Row
            label={t.username || "Username"}
            value={profile?.username || "—"}
            onPress={openUsernameEdit}
            last={false}
          />

          {/* Language — client-side device preference, picker modal below. */}
          <Row
            label={t.language || "Language"}
            value={langLabel}
            onPress={() => setLangModal(true)}
            last={false}
          />

          {/* Not a <Row>: the chip picker expands inline, so the row becomes a
              column and the label stays anchored above it. */}
          <View
            style={[
              styles.row,
              styles.rowDivider,
              genderEditing && styles.rowColumn,
            ]}
          >
            <View style={styles.genderHeader}>
              <Text style={styles.rowLabel}>{t.gender || "Gender"}</Text>
              {genderEditing ? (
                <Pressable onPress={() => setGenderEditing(false)}>
                  <Text style={styles.rowValue}>{t.cancel || "Cancel"}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setGenderEditing(true)}
                  style={styles.rowRight}
                >
                  <Text style={styles.rowValue}>{genderLabel}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
            </View>
            {genderEditing && (
              <View style={styles.genderRow}>
                {GENDER.map(({ key, labelKey }) => {
                  const selected = profile?.gender === key;
                  return (
                    <Pressable
                      key={key}
                      style={[
                        styles.genderChip,
                        selected && styles.genderChipActive,
                      ]}
                      onPress={() => saveGender(key)}
                      disabled={genderSaving}
                    >
                      <Text
                        style={[
                          styles.genderChipText,
                          selected && styles.genderChipTextActive,
                        ]}
                      >
                        {t[labelKey] || key}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Date of birth. Not a <Row> either: DobEditor is a block with its
              own label, three wheels and a save button, so it sits in a padded
              wrapper rather than the row layout. It renders its own section
              label — Section's title above is a different thing.

              Adjust the padding here if it does not line up with the rows;
              settingsStyles owns the row insets and this has to match by hand. */}
          <View style={[styles.rowDivider, { padding: theme.spacing(4) }]}>
            <DobEditor />
          </View>

          <Row
            label={t.email || "Email"}
            value={profile?.email || "—"}
            onPress={() => navigation.navigate("ChangeEmail")}
            last={false}
          />

          {/* Only shown while unconfirmed. Once confirmed the row disappears
              rather than turning into a permanent "Verified ✓" — nothing there
              would be actionable, and a settings screen isn't a trophy cabinet. */}
          {profile && !profile.emailVerified ? (
            <Pressable
              style={[styles.row, styles.rowDivider]}
              onPress={!resending ? resendVerification : undefined}
              disabled={resending}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.rowLabel}>
                  {t.verifyTitle || "Confirm your email"}
                </Text>
                <Text style={styles.rowSublabel}>
                  {t.verifyResend || "Check your inbox, or tap to resend"}
                </Text>
              </View>
              {resending ? (
                <ActivityIndicator size="small" color={theme.colors.textDim} />
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </Pressable>
          ) : null}

          <Row
            label={t.changePin || "Change PIN"}
            onPress={() => navigation.navigate("ChangePin")}
            last={false}
          />

          {/* Where you appear to be. Browsing elsewhere is on the Discover header. */}
          <Row
            label={t.yourLocation || "Your location"}
            value={
              profile?.locationMode === "manual"
                ? profile?.locationName || t.setManually || "Set manually"
                : t.usingGps || "Using GPS"
            }
            onPress={() =>
              navigation.navigate("LocationPicker", { mode: "home" })
            }
            last
          />
        </Section>

        {/* Discovery */}
        <Section title={t.sectionDiscovery || "DISCOVERY"}>
          <Row
            label={t.showMe || "Show me"}
            value={showLabel}
            onPress={cycleShow}
            last={false}
          />
          <View style={[styles.row, styles.rowDivider]}>
            <Text style={styles.rowLabel}>{t.ageRange || "Age range"}</Text>
            <View style={styles.rangeRight}>
              <TextInput
                style={styles.rangeInput}
                value={ageMin}
                onChangeText={setAgeMin}
                onBlur={() => saveAge("ageMin", ageMin)}
                keyboardType="number-pad"
              />
              <Text style={styles.rangeDash}>–</Text>
              <TextInput
                style={styles.rangeInput}
                value={ageMax}
                onChangeText={setAgeMax}
                onBlur={() => saveAge("ageMax", ageMax)}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <ToggleRow
            label={t.anywhere || "Anywhere"}
            sublabel={t.anywhereSub || "Show people at any distance"}
            value={anywhere}
            onValueChange={toggleAnywhere}
            last={anywhere}
          />

          {/* Hidden entirely when "Anywhere" is on — a number-pad field has no
              way to represent "no limit", and leaving it visible-but-disabled
              would just look broken. */}
          {!anywhere && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>
                {t.maxDistance || "Max distance (km)"}
              </Text>
              <TextInput
                style={styles.rangeInput}
                value={distance}
                onChangeText={setDistance}
                onBlur={saveDistance}
                keyboardType="number-pad"
              />
            </View>
          )}
        </Section>
      </ScrollView>

      {/* Username modal */}
      <Modal
        visible={usernameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setUsernameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {t.changeUsername || "Change username"}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={usernameDraft}
              onChangeText={setUsernameDraft}
              autoCapitalize="none"
              autoFocus
              placeholder={t.username || "Username"}
              placeholderTextColor={theme.colors.textDim}
              selectionColor={theme.colors.accent}
            />
            {!!usernameError && (
              <Text style={styles.modalError}>{usernameError}</Text>
            )}
            <View style={styles.modalBtns}>
              <Pressable onPress={() => setUsernameModal(false)}>
                <Text style={styles.modalCancel}>{t.cancel || "Cancel"}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSave,
                  usernameDraft.trim().length < 3 && styles.modalSaveDisabled,
                ]}
                onPress={
                  usernameDraft.trim().length >= 3 && !usernameSaving
                    ? saveUsername
                    : undefined
                }
              >
                {usernameSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>{t.save || "Save"}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Language picker — bottom sheet. The backdrop is a Pressable that
          dismisses; the sheet itself is a plain View so taps inside don't
          bubble to it (RN Pressables don't propagate to parent Pressables,
          so no stopPropagation is needed). */}
      <Modal
        visible={langModal}
        transparent
        animationType="slide"
        onRequestClose={() => setLangModal(false)}
      >
        <View style={styles.langModalRoot}>
          <Pressable
            style={styles.langBackdrop}
            onPress={() => !langSaving && setLangModal(false)}
          />
          <View
            style={[
              styles.langSheet,
              { paddingBottom: insets.bottom + theme.spacing(4) },
            ]}
          >
            <View style={styles.langHandle} />
            <Text style={styles.langTitle}>{t.language || "Language"}</Text>
            <ScrollView
              style={styles.langList}
              contentContainerStyle={{ paddingBottom: theme.spacing(2) }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {SUPPORTED_LANGS.map((code, i) => {
                const selected = code === lang;
                return (
                  <Pressable
                    key={code}
                    style={[
                      styles.langRow,
                      i < SUPPORTED_LANGS.length - 1 && styles.langRowDivider,
                    ]}
                    onPress={() => !langSaving && selectLang(code)}
                    disabled={langSaving}
                    android_ripple={{ color: theme.colors.surfaceAlt }}
                  >
                    <Text
                      style={[
                        styles.langName,
                        selected && styles.langNameActive,
                      ]}
                    >
                      {LANG_NAMES[code] || code.toUpperCase()}
                    </Text>
                    {selected ? <Text style={styles.langCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
