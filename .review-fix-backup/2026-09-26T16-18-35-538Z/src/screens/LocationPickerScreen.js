// localpulse/app/src/screens/LocationPickerScreen.js
//
// Search and pick a place. Used for two things, chosen via route params:
//
//   navigation.navigate('LocationPicker', { mode: 'home' })    → sets my location
//   navigation.navigate('LocationPicker', { mode: 'browse' })  → sets where I browse
//
// Both modes save on tap and pop the screen. Onboarding needs to stage a pick
// and commit it on Continue instead, so it has its own inline step rather than
// a third mode here — but both share usePlaceSearch.
import React, { useState } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { api } from '../api/client.js';
import { usePlaceSearch } from '../hooks/usePlaceSearch.js';
import { theme, useStyles } from '../theme/theme.js';
import ScreenHeader from '../components/ScreenHeader.js';

export default function LocationPickerScreen({ route, navigation }) {
  const styles = useStyles(stylesFactory);
  const mode = route?.params?.mode === 'browse' ? 'browse' : 'home';

  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const { results, searching } = usePlaceSearch(query);

  async function pick(place) {
    setSaving(true);
    try {
      if (mode === 'browse') {
        await api.setBrowseLocation({ lat: place.lat, lng: place.lng, name: place.name });
      } else {
        await api.setLocation({ lat: place.lat, lng: place.lng, name: place.name, mode: 'manual' });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save location', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function useCurrentLocation() {
    setSaving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to use your current position.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = pos.coords;
      if (mode === 'browse') {
        await api.setBrowseLocation({ clear: true });
      } else {
        await api.setLocation({ lat: latitude, lng: longitude, mode: 'gps' });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not get your location', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  const title = mode === 'browse' ? 'Browse another area' : 'Set your location';
  const resetLabel = mode === 'browse' ? 'Browse near me again' : 'Use my current location';

  return (
    <View style={styles.root}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.input}
          placeholder="Search for a city or area…"
          placeholderTextColor={theme.colors.textDim}
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching ? (
          <ActivityIndicator style={styles.inlineSpinner} size="small" color={theme.colors.textDim} />
        ) : null}
      </View>

      <Pressable style={styles.currentBtn} onPress={useCurrentLocation} disabled={saving}>
        <Text style={styles.currentText}>{resetLabel}</Text>
      </Pressable>

      {searching && results.length === 0 ? (
        <View style={styles.centered}><ActivityIndicator color={theme.colors.accent} /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(p, i) => `${p.lat},${p.lng},${i}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => pick(item)} disabled={saving}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowFull} numberOfLines={1}>{item.fullName}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            query.trim().length >= 2 ? (
              <Text style={styles.empty}>No places found for “{query.trim()}”.</Text>
            ) : (
              <Text style={styles.empty}>
                {mode === 'browse'
                  ? 'Search for an area to browse people there.'
                  : 'Search for the area you want to appear in. Your exact position is never stored.'}
              </Text>
            )
          }
        />
      )}

      {saving ? (
        <View style={styles.savingOverlay}><ActivityIndicator color={theme.colors.accent} /></View>
      ) : null}
    </View>
  );
}

const stylesFactory = ({ colors, spacing, radius }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    centered: { paddingVertical: spacing(10), alignItems: 'center' },
    searchWrap: { padding: spacing(4), justifyContent: 'center' },
    inlineSpinner: { position: 'absolute', right: spacing(7), top: '50%', marginTop: -8 },
    input: {
      backgroundColor: colors.surface, color: colors.text, borderRadius: radius.md,
      paddingHorizontal: spacing(4), paddingVertical: spacing(3.5), fontSize: 16,
      borderWidth: 1, borderColor: colors.border,
    },
    currentBtn: {
      marginHorizontal: spacing(4), marginBottom: spacing(3),
      paddingVertical: spacing(3), borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.accent, alignItems: 'center',
    },
    currentText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
    row: {
      paddingHorizontal: spacing(4), paddingVertical: spacing(3.5),
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    rowName: { color: colors.text, fontSize: 16, fontWeight: '600' },
    rowFull: { color: colors.textDim, fontSize: 12, marginTop: 2 },
    empty: {
      color: colors.textDim, textAlign: 'center', marginTop: spacing(10),
      paddingHorizontal: spacing(8), lineHeight: 21,
    },
    savingOverlay: {
      ...StyleSheet.absoluteFillObject, backgroundColor: '#0008',
      alignItems: 'center', justifyContent: 'center',
    },
  });