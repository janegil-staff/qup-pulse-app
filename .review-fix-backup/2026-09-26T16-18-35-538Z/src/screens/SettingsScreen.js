// src/screens/SettingsScreen.js
//
// NOTE: `t` from useLang() is a plain object of strings, not a function.
// Access keys as t.someKey — never t('someKey').
import React from 'react';
import { View, Text, Pressable, Alert, ScrollView, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { useLang } from '../context/LangContext.js';
import { useThemeMode } from '../theme/ThemeContext.js';
import { theme, useStyles } from '../theme/theme.js';
import ScreenHeader from '../components/ScreenHeader.js';
import { Row, ToggleRow, Section, settingsStyles } from '../components/SettingsRows.js';
import Svg, { Path, Polyline, Line } from 'react-native-svg';

// Standard "log out" icon (door with arrow out).
// Stroke follows the theme so it stays visible in both light and dark mode.
function LogOutIcon({ color }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  );
}

export default function SettingsScreen({ navigation }) {
  const styles = useStyles(settingsStyles);
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const { logout } = useAuth();
  const { pref, setPref } = useThemeMode();

  const isDark = pref === 'dark' || (pref === 'system' && theme.mode === 'dark');

  function confirmLogout() {
    Alert.alert(t.logoutConfirmTitle, t.logoutConfirmBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.logout, style: 'destructive', onPress: () => logout() },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      t.deleteAccountTitle,
      t.deleteAccountBody,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAccount();
              await logout();
            } catch (e) {
              Alert.alert(t.error, e.message);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <ScreenHeader
        title={t.settingsTitle}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={confirmLogout} hitSlop={12}>
            <LogOutIcon color={theme.colors.text} />
          </Pressable>
        }
      />

      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: theme.spacing(4), paddingBottom: insets.bottom + theme.spacing(10) }}
      >

        {/* Account + Discovery moved here — this screen was getting long. */}
        <Section>
          <Row
            label={t.personalSettings}
            onPress={() => navigation.navigate('PersonalSettings')}
            last
          />
        </Section>

        {/* Appearance */}
        <Section title={t.appearanceSection}>
          <ToggleRow
            label={t.darkMode}
            value={isDark}
            onValueChange={(v) => setPref(v ? 'dark' : 'light')}
            last={false}
          />
          <Row
            label={t.useSystemSetting}
            value={pref === 'system' ? t.on : t.off}
            onPress={() => setPref(pref === 'system' ? (isDark ? 'dark' : 'light') : 'system')}
            last
          />
        </Section>

        {/* Privacy & safety */}
        <Section title={t.privacySection}>
          <Row label={t.blockedUsersTitle} onPress={() => navigation.navigate('BlockedUsers')} last />
        </Section>

        {/* Legal */}
        <Section title={t.legalSection}>
          <Row label={t.termsOfService} onPress={() => navigation.navigate('Terms')} last={false} />
          <Row label={t.privacyPolicy} onPress={() => navigation.navigate('Privacy')} last />
        </Section>

        {/* Danger zone */}
        <Section>
          <Row label={t.logout} onPress={confirmLogout} last={false} />
          <Row label={t.deleteAccount} onPress={confirmDelete} danger last />
        </Section>

        <Text style={styles.version}>LocalPulse</Text>
      </ScrollView>
    </View>
  );
}