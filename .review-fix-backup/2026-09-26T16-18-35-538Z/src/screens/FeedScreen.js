// localpulse/app/src/screens/FeedScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import { api } from '../api/client.js';
import { useFeedStore } from '../store/feedStore.js';
import PostCard from '../components/PostCard.js';
import ReportSheet from '../components/ReportSheet.js';
import ScreenHeader from '../components/ScreenHeader.js';
import { theme, makeStyles, useStyles } from '../theme/theme.js';
import { useLang } from '../context/LangContext.js';

export default function FeedScreen({ navigation }) {
  const styles = useStyles(stylesFactory);
  const posts = useFeedStore((s) => s.posts);
  const loading = useFeedStore((s) => s.loading);
  const refreshing = useFeedStore((s) => s.refreshing);
  const error = useFeedStore((s) => s.error);
  const loadFeed = useFeedStore((s) => s.loadFeed);
  const loadMore = useFeedStore((s) => s.loadMore);
  const loadingMore = useFeedStore((s) => s.loadingMore);
  const hasMore = useFeedStore((s) => s.hasMore);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const setCoords = useFeedStore((s) => s.setCoords);
  const [tab, setTab] = useState('nearby'); // 'nearby' (All feeds) | 'following'
  const [followingPosts, setFollowingPosts] = useState([]);
  const [followLoading, setFollowLoading] = useState(false);
  // Post being reported (null = sheet closed). Replaces the old Alert-based
  // reportPostFlow, which couldn't host a free-text complaint field.
  const [reportPostId, setReportPostId] = useState(null);
  const { t } = useLang();

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          setCoords({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        }
      } catch {
        /* global feed fallback */
      } finally {
        loadFeed();
      }
    })();
  }, [loadFeed, setCoords]);

  const loadFollowing = useCallback(async () => {
    setFollowLoading(true);
    try {
      const { posts } = await api.getFollowingFeed();
      setFollowingPosts(posts);
    } catch {
      /* ignore */
    } finally {
      setFollowLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'following') loadFollowing();
  }, [tab, loadFollowing]);

  const data = tab === 'nearby' ? posts : followingPosts;
  const isLoading = tab === 'nearby' ? loading : followLoading;

  function openPost(post) {
    navigation.navigate('PostDetail', { post });
  }
  function openAuthor(post) {
    navigation.navigate('Profile', { username: post.author?.username });
  }

  // Report handler for the sheet: takes the enum reason key + optional note and
  // posts it. The sheet owns the reason selection and note input.
  async function submitReport(reason, note) {
    try {
      await api.reportPost(reportPostId, reason, note);
      setReportPostId(null);
      Alert.alert(t.reportThanksTitle || 'Reported', t.reportThanks || 'Thanks — our team will review this.');
    } catch (e) {
      Alert.alert(t.error || 'Error', e?.message ?? t.couldntSend ?? 'Could not send report.');
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={t.feedTitle || 'Feed'} navigation={navigation} />

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'nearby' && styles.tabActive]} onPress={() => setTab('nearby')}>
          <Text style={[styles.tabText, tab === 'nearby' && styles.tabTextActive]}>{t.allFeeds || 'All feeds'}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'following' && styles.tabActive]} onPress={() => setTab('following')}>
          <Text style={[styles.tabText, tab === 'following' && styles.tabTextActive]}>{t.feedFollowing || 'Following'}</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.accent} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={toggleLike}
              onSave={(id) => toggleSave(id, { saved: t.postSaved, unsaved: t.postUnsaved, failed: t.couldntSave })}
              onReport={(post) => setReportPostId(post.id)}
              onPress={() => openPost(item)}
              onAuthorPress={() => openAuthor(item)}
            />
          )}
          contentContainerStyle={{ paddingVertical: theme.spacing(3) }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            // Only the nearby feed paginates via the store; the following tab
            // loads in one shot. Fires at 50% from the bottom so the next page
            // is already arriving before the user reaches it.
            if (tab === 'nearby' && hasMore && !loadingMore) loadMore();
          }}
          ListFooterComponent={
            tab === 'nearby' && loadingMore ? (
              <ActivityIndicator style={{ marginVertical: theme.spacing(4) }} color={theme.colors.accent} />
            ) : null
          }
          refreshControl={
            tab === 'nearby' ? (
              <RefreshControl refreshing={refreshing} onRefresh={() => loadFeed({ refresh: true })} tintColor={theme.colors.accent} />
            ) : undefined
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'nearby'
                ? (error || t.feedEmptyNearby || 'No posts yet. Be the first — tap +')
                : (t.feedEmptyFollowing || 'Follow people to see their posts here.')}
            </Text>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('Compose')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <ReportSheet
        visible={reportPostId != null}
        onClose={() => setReportPostId(null)}
        onSubmit={submitReport}
        title={t.reportPostTitle || 'Report post'}
        prompt={t.reportWhy || 'Why are you reporting this?'}
      />
    </View>
  );
}

const stylesFactory = (({ colors, spacing, radius }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    tabs: { flexDirection: 'row', paddingHorizontal: spacing(4), gap: spacing(2), marginTop: spacing(2), marginBottom: spacing(2) },
    tab: { paddingVertical: spacing(2), paddingHorizontal: spacing(4), borderRadius: radius.md },
    tabActive: { backgroundColor: colors.surfaceAlt },
    tabText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
    tabTextActive: { color: colors.text },
    empty: { color: colors.textDim, textAlign: 'center', marginTop: spacing(20), paddingHorizontal: spacing(8), lineHeight: 22 },
    fab: { position: 'absolute', right: spacing(5), bottom: spacing(8), width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
    fabText: { color: '#04101f', fontSize: 32, fontWeight: '300', marginTop: -2 },
  })
);