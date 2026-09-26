// src/components/CheckInBar.js
//
// Top of Discover. The user's location is sent only when they tap Check in
// here, in LocationPicker (mode 'checkin') or in onboarding step 3 — never
// automatically (App Review 5.1.2(i)).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useStyles, theme } from '../theme/theme.js';
import { useLang } from '../context/LangContext.js';
import { checkInHere, getLastCheckIn, formatCheckIn } from '../lib/locationSharing.js';

export default function CheckInBar({ onChanged, onPickPlace, refreshKey }) {
  const s = useStyles(stylesFactory);
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);

  const readLast = useCallback(() => { getLastCheckIn().then(setLast); }, []);
  useEffect(readLast, [readLast, refreshKey]);

  async function onCheckIn() {
    setBusy(true);
    try {
      const res = await checkInHere(t);
      if (res) {
        setLast(res);
        await onChanged?.();
      }
    } catch (e) {
      Alert.alert(t.checkInFailed, e?.message ?? '');
    } finally {
      setBusy(false);
    }
  }

  const sub = last
    ? (t.lastCheckIn || 'Last check-in {time}').replace('{time}', formatCheckIn(last)) +
      (last.name ? ` · ${last.name}` : '')
    : t.checkInBarSub;

  return (
    <View style={s.bar}>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{t.checkInBarTitle}</Text>
        <Text style={s.sub} numberOfLines={2}>{sub}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : (
        <View style={s.btns}>
          <Pressable style={s.btn} onPress={onCheckIn} hitSlop={8}>
            <Text style={s.btnText}>{t.checkIn}</Text>
          </Pressable>
          {onPickPlace ? (
            <Pressable onPress={onPickPlace} hitSlop={8}>
              <Text style={s.link}>{t.checkInPickPlace}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const stylesFactory = ({ colors }) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    title: { color: colors.text, fontSize: 14, fontWeight: '700' },
    sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
    btns: { alignItems: 'flex-end', gap: 6 },
    btn: { backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    link: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  });
