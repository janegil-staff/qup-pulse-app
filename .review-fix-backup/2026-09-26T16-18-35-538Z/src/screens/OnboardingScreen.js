// localpulse/app/src/screens/OnboardingScreen.js
//
// Four steps: account → details → location → photos/bio.
// The account is created at the end of step 1, so every later step saves
// directly to the server and the user can bail and resume.
//
// Location has no Skip: getDeck() throws without coordinates, so a skipped
// location means the first Discover load is an error screen. Photos and bio
// are genuinely optional; location is not.
//
// Styles go through useStyles(stylesFactory), NOT a module-scope
// `const C = theme.colors`. That snapshot is taken at import time, before
// ThemeContext resolves, so every colour freezes at its light-mode value —
// which is why the DOB modal rendered dark text on a dark sheet.
//
// The same rule applies to hooks: useAuth() is called inside the component,
// never at module scope. A module-scope call runs at import time with no
// React context, which is an invalid hook call.
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import Svg, { Path, Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext.js";
import { useLang } from "../context/LangContext.js";
import { usePlaceSearch } from "../hooks/usePlaceSearch.js";
import { api } from "../api/client.js";
import { theme, useStyles } from "../theme/theme.js";

const MAX_PHOTOS = 6;
const TOTAL_STEPS = 4;

// Row height in the DOB modal. Shared with getItemLayout below — change one
// and the scroll position drifts, so they live next to each other.
const MODAL_ROW_HEIGHT = 44;

const LANGUAGES = [
  { code: "no", flag: "🇳🇴", label: "Norsk" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "sv", flag: "🇸🇪", label: "Svenska" },
  { code: "da", flag: "🇩🇰", label: "Dansk" },
  { code: "fi", flag: "🇫🇮", label: "Suomi" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "pl", flag: "🇵🇱", label: "Polski" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
];

const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();

// The list starts 18 years back, so the age gate is enforced by the options
// themselves — there is no year in the wheel that produces a minor.
const DOB_YEARS = Array.from({ length: 83 }, (_, i) =>
  String(CURRENT_YEAR - 18 - i),
);

// Where the year wheel opens. NOT a value the user has agreed to: day and
// month stay empty, so dobStr is still falsy and submitStep2 keeps rejecting
// until they have actually picked a full date.
const DEFAULT_DOB_YEAR = String(CURRENT_YEAR - 25);

function daysInMonth(year, monthIdx) {
  return new Date(Number(year), monthIdx + 1, 0).getDate();
}

function GenderIcon({ type, active, color, size = 44 }) {
  if (type === "female")
    return (
      <Svg width={size} height={size} viewBox="0 0 44 44" fill="none">
        <Circle
          cx="22"
          cy="11"
          r="7"
          stroke={color}
          strokeWidth="2.2"
          fill={active ? "rgba(255,255,255,0.25)" : "none"}
        />
        <Path
          d="M15 10 Q14 5 18 4"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <Path
          d="M29 10 Q30 5 26 4"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <Path
          d="M10 38 Q10 26 22 26 Q34 26 34 38"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill={active ? "rgba(255,255,255,0.15)" : "none"}
        />
        <Path
          d="M16 26 Q14 32 12 38 M28 26 Q30 32 32 38"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </Svg>
    );
  if (type === "male")
    return (
      <Svg width={size} height={size} viewBox="0 0 44 44" fill="none">
        <Circle
          cx="22"
          cy="11"
          r="7"
          stroke={color}
          strokeWidth="2.2"
          fill={active ? "rgba(255,255,255,0.25)" : "none"}
        />
        <Path
          d="M10 38 Q10 26 22 26 Q34 26 34 38"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill={active ? "rgba(255,255,255,0.15)" : "none"}
        />
        <Path
          d="M19 26 L22 30 L25 26"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <Circle
        cx="22"
        cy="11"
        r="7"
        stroke={color}
        strokeWidth="2.2"
        fill={active ? "rgba(255,255,255,0.25)" : "none"}
      />
      <Path
        d="M19 8 Q19 6 22 6 Q25 6 25 9 Q25 11 22 12 L22 14"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Circle cx="22" cy="16.5" r="1" fill={color} />
      <Path
        d="M10 38 Q10 26 22 26 Q34 26 34 38"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill={active ? "rgba(255,255,255,0.15)" : "none"}
      />
    </Svg>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize = "none",
}) {
  const s = useStyles(stylesFactory);
  return (
    <View style={{ width: "100%", marginBottom: 22 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.fieldInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={theme.colors.textDim}
        selectionColor={theme.colors.accent}
      />
      <View style={s.fieldLine} />
    </View>
  );
}

function StepIndicator({ step }) {
  const s = useStyles(stylesFactory);
  const C = theme.colors;
  const steps = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
  return (
    <View style={s.stepRow}>
      {steps.map((n) => (
        <React.Fragment key={n}>
          <View
            style={[
              s.stepCircle,
              {
                backgroundColor: step >= n ? C.accent : C.surface,
                borderColor: step >= n ? C.accent : C.border,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: step >= n ? "#fff" : C.textDim,
              }}
            >
              {n}
            </Text>
          </View>
          {n < TOTAL_STEPS && (
            <View
              style={[
                s.stepLine,
                { backgroundColor: step > n ? C.accent : C.border },
              ]}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

export default function OnboardingScreen({ navigation, route }) {
  const s = useStyles(stylesFactory);
  const C = theme.colors; // read at render, not at import — see the file header
  const { register, savePin, hydrate, setIsNewUser } = useAuth();
  const { t, lang, setLang } = useLang();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(1);
  const [accountCreated, setAccountCreated] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [tncAccepted, setTncAccepted] = useState(false);
  const [infoAccepted, setInfoAccepted] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const [gender, setGender] = useState("female");

  // Pre-filled to 1 Jan, 25 years back, so the wheels open somewhere sensible
  // and the preview reads as a real date. Note this makes dobStr truthy
  // immediately — submitStep2 will accept it whether or not the user touched
  // the pickers.
  const [dobYear, setDobYear] = useState(DEFAULT_DOB_YEAR);
  const [dobMonth, setDobMonth] = useState("01");
  const [dobDay, setDobDay] = useState("01");
  const [dobPicker, setDobPicker] = useState(null);

  // Step 3 — location. The pick is staged locally and committed by Continue,
  // unlike LocationPickerScreen which saves on tap and pops.
  const [placeQuery, setPlaceQuery] = useState("");
  const [picked, setPicked] = useState(null); // { lat, lng, name, fullName } | { gps: true, lat, lng }
  const { results: placeResults, searching: placeSearching } =
    usePlaceSearch(placeQuery);

  // Step 4. Photos are { url, publicId } objects — the server needs the
  // publicId to destroy the Cloudinary asset when a photo is removed.
  const [photos, setPhotos] = useState([]);
  const [bio, setBio] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = route?.params ?? {};
    if (p.pin) setPin(p.pin);
    if (p.email) setEmail(p.email);
    if (p.username) setUsername(p.username);
    if (p.language) setLang(p.language);
    if (p.tncAccepted !== undefined) setTncAccepted(Boolean(p.tncAccepted));
    if (p.infoAccepted !== undefined) setInfoAccepted(Boolean(p.infoAccepted));
    if (p.gender) setGender(p.gender);
    if (p.step) setStep(p.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params]);

  const MONTHS = t.months;
  const pinSet = pin.length === 4;
  const canStep1 =
    tncAccepted && infoAccepted && pinSet && email.trim() && username.trim();

  const dobStr =
    dobYear && dobMonth && dobDay ? `${dobYear}-${dobMonth}-${dobDay}` : "";
  const dobLabel = dobStr
    ? `${Number(dobDay)} ${MONTHS[Number(dobMonth) - 1]} ${dobYear}`
    : t.selectDob;

  // Navigate to the two-screen PIN flow (Choose PIN -> Confirm PIN).
  // PinConfirm navigates back to 'Onboarding' with { ...returnParams, pin },
  // which the useEffect above picks up and stores.
  const openPinEntry = () => {
    navigation.navigate("PinSetup", {
      returnTo: "Onboarding",
      returnParams: {
        email,
        username,
        language: lang,
        tncAccepted,
        infoAccepted,
        gender,
        step: 1,
      },
    });
  };

  // Step 1 → create the account NOW (username + email + PIN). After this the
  // user has a real, loginable account and can resume if they bail.
  const advanceToStep2 = async () => {
    console.log("STEP1 pressed", { accountCreated, canStep1, loading });
    setError("");
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email.trim())) {
      setError(t.emailInvalid);
      return;
    }
    if (username.trim().length < 3) {
      setError(t.usernameShort);
      return;
    }
    if (!pinSet) {
      setError(t.pinRequired);
      return;
    }
    if (!tncAccepted || !infoAccepted) {
      setError(t.acceptTermsRequired);
      return;
    }

    if (accountCreated) {
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      await register(
        {
          email: email.trim().toLowerCase(),
          password: pin,
          pin,
          username: username.trim(),
          displayName: username.trim(),
        },
        { deferUser: true }, // don't publish the user yet — profile isn't complete
      );
      console.log("STEP1 register ok");
      if (savePin) {
        try {
          await savePin(pin);
        } catch {}
      }
      try {
        await api.updateMyProfile({ language: lang });
        console.log("STEP1 -> step 2");
      } catch {
        console.log("STEP1 register FAILED", e?.message);
      }
      setAccountCreated(true);
      setStep(2);
    } catch (e) {
      console.log("STEP1 register FAILED", e?.message);
      setError(e?.message ?? t.couldNotFinish);
    } finally {
      setLoading(false);
    }
  };

  // Step 2 → save dob + gender to the server, then advance.
  const submitStep2 = async () => {
    setError("");
    if (!dobStr) {
      setError(t.dobRequired);
      return;
    }
    setLoading(true);
    try {
      await api.updateMyProfile({ dob: dobStr, gender });
      setStep(3);
    } catch (e) {
      setError(e?.message ?? t.couldNotFinish);
    } finally {
      setLoading(false);
    }
  };

  // Ask for GPS immediately — the user tapped a button that says so, which is
  // the moment the OS prompt is least likely to be denied. Denial isn't fatal:
  // the search field is still right there.
  const useCurrentLocation = async () => {
    setError("");
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("", t.locationDenied);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = pos.coords;
      setPicked({ gps: true, lat: latitude, lng: longitude });
      setPlaceQuery("");
    } catch (e) {
      setError(e?.message ?? t.couldNotFinish);
    } finally {
      setLoading(false);
    }
  };

  // Step 3 → commit the staged pick, then advance.
  const submitStep3 = async () => {
    setError("");
    if (!picked) {
      setError(t.locationRequired);
      return;
    }
    setLoading(true);
    try {
      if (picked.gps) {
        await api.setLocation({
          lat: picked.lat,
          lng: picked.lng,
          mode: "gps",
        });
      } else {
        await api.setLocation({
          lat: picked.lat,
          lng: picked.lng,
          name: picked.name,
          mode: "manual",
        });
      }
      setStep(4);
    } catch (e) {
      setError(e?.message ?? t.couldNotFinish);
    } finally {
      setLoading(false);
    }
  };

  // Add a photo: pick, upload immediately (the account exists from step 1), and
  // save the { url, publicId } pair to the profile so it persists per-step.
  const addPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert("", t.maxPhotos);
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("", t.photosOptional);
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
      setUploadingPhoto?.(true);
      const photo = await api.uploadImage(result.assets[0].uri); // { url, publicId }
      if (!photo?.url) return;
      const next = [...photos, photo];
      setPhotos(next);
      await api.updateMyProfile({ photos: next });
    } catch (e) {
      setError(e?.message ?? t.couldNotFinish);
    } finally {
      setUploadingPhoto?.(false);
    }
  };

  // Dropping a photo from the array is enough — updateProfile diffs the old and
  // new lists server-side and destroys whatever fell out of Cloudinary.
  const removePhoto = async (index) => {
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    try {
      await api.updateMyProfile({ photos: next });
    } catch {}
  };

  // Make a photo the profile picture by moving it to the front (photos[0]).
  const setPrimary = async (index) => {
    if (index === 0) return;
    const next = [...photos];
    const [moved] = next.splice(index, 1);
    next.unshift(moved);
    setPhotos(next);
    try {
      await api.updateMyProfile({ photos: next });
    } catch {}
  };

  // Finish: account, location, and photos are already saved per-step. Save the
  // bio if there is one, then end the first-run flow.
  const finishStep4 = async () => {
    setError("");
    setLoading(true);
    try {
      if (bio.trim()) {
        await api.updateMyProfile({ bio: bio.trim() });
      }
      await hydrate();
      // Ends the first-run flow, which is what moves the navigator to the
      // app. hydrate() runs FIRST so `user` is populated before the branch
      // switches — otherwise the app lands on the boot splash for a beat.
      setIsNewUser(false);
    } catch (e) {
      setError(e?.message ?? t.couldNotFinish);
    } finally {
      setLoading(false);
    }
  };

  // Skip: nothing more to save — the account exists. Same exit as finish.
  const skipStep4 = async () => {
    setError("");
    setLoading(true);
    try {
      await hydrate();
      setIsNewUser(false);
    } catch (e) {
      setError(e?.message ?? t.couldNotFinish);
    } finally {
      setLoading(false);
    }
  };

  const dobOptions =
    dobPicker === "year"
      ? DOB_YEARS
      : dobPicker === "month"
        ? MONTHS.map((_, i) => String(i + 1).padStart(2, "0"))
        : dobPicker === "day"
          ? Array.from(
              {
                length:
                  dobYear && dobMonth
                    ? daysInMonth(dobYear, Number(dobMonth) - 1)
                    : 31,
              },
              (_, i) => String(i + 1).padStart(2, "0"),
            )
          : [];

  // Which row the modal should open on. -1 (nothing selected yet) becomes 0.
  const dobSelectedIndex = Math.max(
    0,
    dobOptions.indexOf(
      dobPicker === "year"
        ? dobYear
        : dobPicker === "month"
          ? dobMonth
          : dobDay,
    ),
  );

  const headerTitle =
    step === 1
      ? t.stepAccount
      : step === 2
        ? t.stepDetails
        : step === 3
          ? t.stepLocation
          : t.stepPhotos;

  return (
    <View style={s.bg}>
      {/* Fixed header bar — below the notch, above everything else */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={s.headerBack}
          onPress={() =>
            step > 1 ? setStep(step - 1) : navigation.navigate("Auth")
          }
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={s.headerBack} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <StepIndicator step={step} />

          {step === 1 && (
            <>
              <Text style={s.sectionLabel}>{t.language}</Text>
              <View style={{ marginBottom: 24 }}>
                <TouchableOpacity
                  style={[s.langBox, langOpen && { borderColor: C.accent }]}
                  onPress={() => setLangOpen((o) => !o)}
                  activeOpacity={0.8}
                >
                  <Text style={s.langFlag}>
                    {LANGUAGES.find((l) => l.code === lang)?.flag ?? "🌐"}
                  </Text>
                  <Text style={s.langLabel}>
                    {LANGUAGES.find((l) => l.code === lang)?.label ?? lang}
                  </Text>
                  <Text style={{ color: C.textDim, fontSize: 11 }}>
                    {langOpen ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>
                {langOpen && (
                  <View style={s.langList}>
                    {LANGUAGES.map(({ code, flag, label }) => {
                      const active = lang === code;
                      return (
                        <TouchableOpacity
                          key={code}
                          style={[
                            s.langItem,
                            active && { backgroundColor: C.accent + "14" },
                          ]}
                          onPress={() => {
                            setLang(code);
                            setLangOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={s.langFlag}>{flag}</Text>
                          <Text
                            style={[
                              s.langItemLabel,
                              { color: active ? C.accent : C.text },
                              active && { fontWeight: "700" },
                            ]}
                          >
                            {label}
                          </Text>
                          {active && (
                            <Text style={{ color: C.accent, fontSize: 16 }}>
                              ✓
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {!!error && <Text style={s.error}>{error}</Text>}

              <Field
                label={t.usernameReq}
                value={username}
                onChangeText={setUsername}
              />
              <Field
                label={t.emailReq}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />

              <TouchableOpacity style={s.pinRow} onPress={openPinEntry}>
                <Text style={s.pinLabel}>{t.pinCodeReq}</Text>
                <Text style={[s.pinAction, pinSet && s.pinDone]}>
                  {pinSet ? `${t.pinCreated} ✓` : `${t.createPin} ›`}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 16 }} />

              <TouchableOpacity
                style={s.checkRow}
                onPress={() => setTncAccepted(!tncAccepted)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, tncAccepted && s.checkboxOn]}>
                  {tncAccepted && <Text style={s.checkMark}>✓</Text>}
                </View>
                <Text style={s.checkText}>
                  {t.acceptTermsPre}{" "}
                  <Text
                    style={s.checkLink}
                    onPress={() => navigation.navigate("Terms")}
                  >
                    {t.termsAndConditions}
                  </Text>{" "}
                  {t.acceptTermsPost}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 12 }} />

              <TouchableOpacity
                style={s.checkRow}
                onPress={() => setInfoAccepted(!infoAccepted)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, infoAccepted && s.checkboxOn]}>
                  {infoAccepted && <Text style={s.checkMark}>✓</Text>}
                </View>
                <Text style={s.checkText}>
                  {t.consentPre}{" "}
                  <Text
                    style={s.checkLink}
                    onPress={() => navigation.navigate("Privacy")}
                    suppressHighlighting
                  >
                    {t.privacyPolicy}
                  </Text>
                  {t.consentPost ? ` ${t.consentPost}` : "."}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 28 }} />

              <TouchableOpacity
                style={[s.btn, (!canStep1 || loading) && s.btnDisabled]}
                onPress={canStep1 && !loading ? advanceToStep2 : undefined}
                activeOpacity={canStep1 && !loading ? 0.85 : 1}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnText}>{t.continue.toUpperCase()} →</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 24 }} />
              <TouchableOpacity onPress={() => navigation.navigate("Auth")}>
                <Text style={s.alreadyText}>{t.alreadyAccount}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 2 && (
            <>
              <Image
                source={require("../../assets/images/signup_hero.png")}
                style={s.heroImage}
                resizeMode="cover"
              />
              <Text style={s.sectionLabel}>{t.gender}</Text>
              <View style={s.genderRow}>
                {[
                  { key: "female", label: t.female, icon: "female" },
                  { key: "male", label: t.male, icon: "male" },
                  // 'other', not 'undefined' — must match the GENDERS enum on
                  // the User model or the update silently fails validation.
                  { key: "other", label: t.genderUndefined, icon: "unknown" },
                ].map(({ key, label, icon }) => {
                  const active = gender === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={s.genderItem}
                      onPress={() => setGender(key)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          s.genderCircle,
                          { backgroundColor: active ? C.accent : C.surfaceAlt },
                        ]}
                      >
                        <GenderIcon
                          type={icon}
                          active={active}
                          color={active ? "#fff" : C.accent}
                          size={44}
                        />
                      </View>
                      <Text
                        style={[
                          s.genderText,
                          active && { color: C.accent, fontWeight: "700" },
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.sectionLabel}>{t.dob}</Text>
              <View style={s.dobRow}>
                <TouchableOpacity
                  style={s.dobBox}
                  onPress={() => setDobPicker("day")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[s.dobValue, { color: dobDay ? C.text : C.textDim }]}
                  >
                    {dobDay ? String(Number(dobDay)) : t.day}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.dobBox, { flex: 1.4 }]}
                  onPress={() => setDobPicker("month")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      s.dobValue,
                      { color: dobMonth ? C.text : C.textDim },
                    ]}
                  >
                    {dobMonth ? MONTHS[Number(dobMonth) - 1] : t.month}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.dobBox, { flex: 1.3 }]}
                  onPress={() => setDobPicker("year")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      s.dobValue,
                      { color: dobYear ? C.text : C.textDim },
                    ]}
                  >
                    {dobYear || t.year}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={s.dobPreview}>{dobLabel}</Text>

              {!!error && <Text style={s.error}>{error}</Text>}

              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={!loading ? submitStep2 : undefined}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnText}>{t.continue.toUpperCase()} →</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 3 && (
            <>
              {/* No sectionLabel here — the header already says "Location", and
                  a second "Set your location" directly under it just repeats. */}
              <Text style={s.locExplain}>{t.locationPrivacy}</Text>

              <View style={s.searchWrap}>
                <TextInput
                  style={s.searchInput}
                  placeholder={t.searchCityPlaceholder}
                  placeholderTextColor={C.textDim}
                  value={placeQuery}
                  onChangeText={setPlaceQuery}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {placeSearching ? (
                  <ActivityIndicator
                    style={s.inlineSpinner}
                    size="small"
                    color={C.textDim}
                  />
                ) : null}
              </View>

              <TouchableOpacity
                style={s.currentBtn}
                onPress={!loading ? useCurrentLocation : undefined}
                activeOpacity={0.8}
              >
                <Text style={s.currentText}>{t.enableLocation}</Text>
              </TouchableOpacity>

              {/* The staged pick. Nothing is written until Continue. */}
              {picked && (
                <View style={s.pickedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickedName}>
                      {picked.gps ? t.usingCurrentLocation : picked.name}
                    </Text>
                    {!picked.gps && picked.fullName ? (
                      <Text style={s.pickedFull} numberOfLines={1}>
                        {picked.fullName}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={s.pickedCheck}>✓</Text>
                </View>
              )}

              {/* Picking clears the query, which empties this list — the staged
                  row above becomes the only copy. Rendered inline rather than
                  in a FlatList: this screen is already inside a ScrollView, and
                  nesting the two breaks scrolling. The list is short. */}
              {placeResults.map((p, i) => (
                <TouchableOpacity
                  key={`${p.lat},${p.lng},${i}`}
                  style={s.placeRow}
                  onPress={() => {
                    setPicked(p);
                    setPlaceQuery("");
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.placeName}>{p.name}</Text>
                    <Text style={s.placeFull} numberOfLines={1}>
                      {p.fullName}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {placeQuery.trim().length >= 2 &&
                !placeSearching &&
                placeResults.length === 0 && (
                  <Text style={s.locEmpty}>{t.noPlacesFound}</Text>
                )}

              {!!error && (
                <Text style={[s.error, { marginTop: 18 }]}>{error}</Text>
              )}

              <View style={{ height: 24 }} />

              <TouchableOpacity
                style={[s.btn, (!picked || loading) && s.btnDisabled]}
                onPress={picked && !loading ? submitStep3 : undefined}
                activeOpacity={picked && !loading ? 0.85 : 1}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnText}>{t.continue.toUpperCase()} →</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 4 && (
            <>
              <Text style={s.sectionLabel}>{t.photosOptional}</Text>
              {photos.length > 0 && (
                <Text style={s.photoHint}>{t.tapToSetProfile}</Text>
              )}
              <View style={s.photoGrid}>
                {photos.map((photo, i) => (
                  <TouchableOpacity
                    key={`${photo.url}-${i}`}
                    style={[s.photoCell, i === 0 && s.photoCellPrimary]}
                    onPress={() => setPrimary(i)}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: photo.url }} style={s.photoImg} />
                    {i === 0 && (
                      <View style={s.photoBadge}>
                        <Text style={s.photoBadgeText}>{t.profilePhoto}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={s.photoRemove}
                      onPress={() => removePhoto(i)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={s.photoRemoveText}>×</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <TouchableOpacity
                    style={s.photoAdd}
                    onPress={addPhoto}
                    activeOpacity={0.8}
                  >
                    <Text style={s.photoAddPlus}>＋</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={[s.sectionLabel, { marginTop: 24 }]}>
                {t.bioOptional}
              </Text>
              <TextInput
                style={s.bioInput}
                value={bio}
                onChangeText={setBio}
                placeholder={t.bioPlaceholder}
                placeholderTextColor={C.textDim}
                multiline
                maxLength={500}
                textAlignVertical="top"
                selectionColor={C.accent}
              />

              {!!error && <Text style={s.error}>{error}</Text>}

              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={!loading ? finishStep4 : undefined}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnText}>{t.finish.toUpperCase()}</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 16 }} />
              <TouchableOpacity onPress={!loading ? skipStep4 : undefined}>
                <Text style={s.alreadyText}>{t.skipForNow}</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={!!dobPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setDobPicker(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setDobPicker(null)}
        >
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>
              {dobPicker === "year"
                ? t.year
                : dobPicker === "month"
                  ? t.month
                  : t.day}
            </Text>
            <FlatList
              data={dobOptions}
              keyExtractor={(item) => item}
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
              // Open on the current selection rather than the top of the list.
              // The year wheel defaults 25 years back, which is ~7 rows down —
              // without this the user has to scroll to see what is selected.
              //
              // getItemLayout is REQUIRED: FlatList cannot scroll to an index
              // it has not measured, and silently ignores initialScrollIndex
              // without it.
              initialScrollIndex={dobSelectedIndex}
              getItemLayout={(_, index) => ({
                length: MODAL_ROW_HEIGHT,
                offset: MODAL_ROW_HEIGHT * index,
                index,
              })}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.modalItem}
                  onPress={() => {
                    if (dobPicker === "year") setDobYear(item);
                    else if (dobPicker === "month") setDobMonth(item);
                    else setDobDay(item);
                    setDobPicker(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.modalItemText}>
                    {dobPicker === "month"
                      ? MONTHS[Number(item) - 1]
                      : dobPicker === "day"
                        ? String(Number(item))
                        : item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const stylesFactory = ({ colors: C }) =>
  StyleSheet.create({
    bg: { flex: 1, backgroundColor: C.bg },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 30,
      paddingTop: 20,
      paddingBottom: 50,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: C.accent,
    },
    headerBack: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      color: "#fff",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    },
    backArrow: { color: "#fff", fontSize: 34, lineHeight: 36 },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 28,
    },
    stepCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    stepLine: { width: 28, height: 2, marginHorizontal: 6 },
    sectionLabel: {
      color: C.textDim,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 14,
      marginTop: 6,
      letterSpacing: 0.3,
    },
    heroImage: {
      width: "100%",
      height: 180,
      borderRadius: 16,
      marginBottom: 24,
    },
    error: { color: C.danger, fontSize: 14, marginBottom: 14 },
    fieldLabel: {
      color: C.textDim,
      fontSize: 15,
      fontWeight: "600",
      marginBottom: 6,
    },
    fieldInput: {
      color: C.text,
      fontSize: 16,
      fontWeight: "500",
      paddingBottom: 8,
    },
    fieldLine: { height: 2, backgroundColor: C.border, width: "100%" },
    langBox: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: 1.5,
      borderColor: C.border,
      borderRadius: 12,
      backgroundColor: C.surface,
      gap: 10,
    },
    langFlag: { fontSize: 20 },
    langLabel: { flex: 1, color: C.text, fontSize: 16, fontWeight: "600" },
    langList: {
      borderWidth: 1.5,
      borderColor: C.border,
      borderTopWidth: 0,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      overflow: "hidden",
      marginTop: -2,
      backgroundColor: C.surface,
    },
    langItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      gap: 10,
    },
    langItemLabel: { flex: 1, fontSize: 16 },
    pinRow: {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
      paddingBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: C.border,
    },
    pinLabel: { color: C.textDim, fontSize: 16, fontWeight: "600" },
    pinAction: { color: C.accent, fontSize: 16, fontWeight: "700" },
    pinDone: { color: C.success },
    checkRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: C.accent,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 2,
      flexShrink: 0,
    },
    checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
    checkMark: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 16,
    },
    checkText: { color: C.text, fontSize: 14, lineHeight: 20, flex: 1 },
    checkLink: {
      color: C.accent,
      fontWeight: "700",
      textDecorationLine: "underline",
    },
    genderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    genderItem: { alignItems: "center", flex: 1 },
    genderCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    genderText: { fontSize: 14, color: C.textDim, fontWeight: "500" },
    dobRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
    dobBox: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 14,
      borderWidth: 1.5,
      borderColor: C.border,
      borderRadius: 10,
      backgroundColor: C.surface,
      alignItems: "center",
    },
    dobValue: { fontSize: 16, fontWeight: "600" },
    dobPreview: {
      color: C.textDim,
      fontSize: 13,
      marginBottom: 22,
      textAlign: "center",
    },

    // Location step
    locExplain: {
      color: C.textDim,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 18,
    },
    searchWrap: { justifyContent: "center", marginBottom: 12 },
    searchInput: {
      backgroundColor: C.surface,
      color: C.text,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 16,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    inlineSpinner: {
      position: "absolute",
      right: 14,
      top: "50%",
      marginTop: -8,
    },
    currentBtn: {
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: C.accent,
      alignItems: "center",
      marginBottom: 18,
    },
    currentText: { color: C.accent, fontWeight: "700", fontSize: 15 },
    pickedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: C.accent,
      backgroundColor: C.accent + "14",
      marginBottom: 12,
    },
    pickedName: { color: C.text, fontSize: 16, fontWeight: "700" },
    pickedFull: { color: C.textDim, fontSize: 12, marginTop: 2 },
    pickedCheck: { color: C.accent, fontSize: 18, fontWeight: "800" },
    placeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    placeName: { color: C.text, fontSize: 16, fontWeight: "600" },
    placeFull: { color: C.textDim, fontSize: 12, marginTop: 2 },
    locEmpty: {
      color: C.textDim,
      fontSize: 14,
      textAlign: "center",
      marginTop: 24,
    },

    photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    photoHint: { color: C.textDim, fontSize: 13, marginBottom: 10 },
    photoCell: {
      width: 100,
      height: 100,
      borderRadius: 12,
      position: "relative",
    },
    photoCellPrimary: { borderWidth: 2, borderColor: C.accent },
    photoBadge: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.accent,
      paddingVertical: 3,
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 10,
      alignItems: "center",
    },
    photoBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
    photoImg: {
      width: 100,
      height: 100,
      borderRadius: 12,
      backgroundColor: C.surfaceAlt,
    },
    photoRemove: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: C.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    photoRemoveText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
      lineHeight: 18,
    },
    photoAdd: {
      width: 100,
      height: 100,
      borderRadius: 12,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: C.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    photoAddPlus: { color: C.accent, fontSize: 34, fontWeight: "300" },
    bioInput: {
      minHeight: 110,
      borderWidth: 1.5,
      borderColor: C.border,
      borderRadius: 12,
      backgroundColor: C.surface,
      color: C.text,
      fontSize: 16,
      padding: 14,
      marginBottom: 8,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    modalSheet: {
      width: "100%",
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: C.border,
      backgroundColor: C.surface,
      overflow: "hidden",
    },
    modalTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "700",
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    // height must match MODAL_ROW_HEIGHT — getItemLayout assumes it.
    modalItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 12,
      height: 44,
    },
    // Was an inline `{ color: C.text }` reading the frozen module-scope snapshot —
    // the reason the day numbers rendered near-black on the dark sheet.
    modalItemText: { color: C.text, fontSize: 16, fontWeight: "500" },
    btn: {
      width: "100%",
      height: 56,
      backgroundColor: C.accent,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: C.accent,
      shadowOpacity: 0.4,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    btnDisabled: { opacity: 0.4 },
    btnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 2,
    },
    alreadyText: {
      color: C.textDim,
      fontSize: 16,
      fontWeight: "600",
      textAlign: "center",
    },
  });
