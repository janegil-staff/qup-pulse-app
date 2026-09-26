// src/lib/locationSharing.js
//
// The one place that decides when this user's location is sent to the server
// (where it makes them findable in other people's Discover). Written for App
// Review guideline 5.1.2(i), client-side only (no API changes):
//
//   1. CONSENT — an in-app yes/no ("Show you to people nearby?") that can be
//      declined; the app stays usable. Stored on this device and revocable in
//      Settings. Separate from the iOS permission prompt, which only covers
//      reading GPS, not showing the user to others.
//   2. MANUAL CHECK-IN — location is sent ONLY when the user taps Check in (or
//      picks a place). No timers, no on-focus refresh, no background task.
//
// Browsing Discovery and ranking the feed may read the device position
// (coordsIfAlreadyPermitted), which never prompts and is never saved as the
// user's location.
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { api } from '../api/client.js';

const CONSENT_KEY = 'location_sharing_consent'; // 'yes' | 'no'
const LAST_CHECKIN_KEY = 'location_last_checkin'; // JSON { at, name }

export async function getLocationConsent() {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY)) === 'yes';
  } catch {
    return false;
  }
}

export async function setLocationConsent(enabled) {
  await AsyncStorage.setItem(CONSENT_KEY, enabled ? 'yes' : 'no');
}

export async function getLastCheckIn() {
  try {
    const raw = await AsyncStorage.getItem(LAST_CHECKIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Resolves true (Allow) or false (Don't allow / dismissed).
export function askLocationConsent(t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    Alert.alert(
      t.shareLocationTitle,
      t.shareLocationBody,
      [
        { text: t.shareLocationDecline, style: 'cancel', onPress: () => finish(false) },
        { text: t.shareLocationAllow, onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

// Asks only if consent isn't already on. Returns true when sharing is allowed.
export async function ensureLocationConsent(t) {
  if (await getLocationConsent()) return true;
  const yes = await askLocationConsent(t);
  await setLocationConsent(yes);
  return yes;
}

// For browsing/ranking only. Never prompts, never saved as the user's location.
export async function coordsIfAlreadyPermitted() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({});
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

async function recordCheckIn(name) {
  const entry = { at: new Date().toISOString(), name: name ?? null };
  await AsyncStorage.setItem(LAST_CHECKIN_KEY, JSON.stringify(entry)).catch(() => {});
  return entry;
}

// Send a position the user has already chosen (onboarding stages its pick).
// Assumes consent was just given.
export async function sendCheckIn({ lat, lng, name, gps }) {
  if (gps) await api.setLocation({ lat, lng, mode: 'gps' });
  else await api.setLocation({ lat, lng, name, mode: 'manual' });
  return recordCheckIn(gps ? null : name);
}

// Check in at the current GPS position. null if the user declined consent or
// the OS permission. Throws on network errors.
export async function checkInHere(t) {
  if (!(await ensureLocationConsent(t))) return null;
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('', t.locationDenied);
    return null;
  }
  const pos = await Location.getCurrentPositionAsync({});
  return sendCheckIn({ lat: pos.coords.latitude, lng: pos.coords.longitude, gps: true });
}

// Check in at a place picked from search.
export async function checkInAt(t, place) {
  if (!(await ensureLocationConsent(t))) return null;
  return sendCheckIn({ lat: place.lat, lng: place.lng, name: place.name, gps: false });
}

export function formatCheckIn(entry) {
  if (!entry?.at) return '';
  const d = new Date(entry.at);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}
