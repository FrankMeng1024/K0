// K0 全局底部音频播放条 — Sprint 15 音频 demo
// 常驻底部 fixed，撕纸风 sticky bar：▶/⏸ + 时间/进度条 + ×
// 若无音频加载中且无当前 sound → 不渲染

import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { useAudioPlayer, fmtMs } from '@/lib/audioPlayer';

export function AudioPlayerBar() {
  const insets = useSafeAreaInsets();
  const { state, pause, resume, seek, stop } = useAudioPlayer();
  const { currentUrl, currentPosMs, durationMs, isPlaying, isLoading, error } = state;

  // Sprint 16 R8: 路由变化时停止音频（AudioPlayerBar 常驻 root，不会卸载）
  // 在这里监听 pathname 变化，比在每个页面 useFocusEffect cleanup 更安全
  // （页面卸载后调 stop 会崩溃，root 永不卸载不会崩）
  const pathname = usePathname();
  const lastPathRef = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathRef.current !== pathname) {
      console.log('[audio] route change', lastPathRef.current, '→', pathname);
      lastPathRef.current = pathname;
      // 路由真的变了才 stop
      try { stop(); } catch (e: any) { console.log('[audio] route stop err:', e?.message); }
    }
  }, [pathname, stop]);

  // 未加载任何音频且不在加载中 → 不显示
  if (!currentUrl && !isLoading) return null;

  const [trackWidth, setTrackWidth] = React.useState(0);
  const progressPct = durationMs > 0 ? Math.max(0, Math.min(1, currentPosMs / durationMs)) : 0;

  // 简易点击进度条 seek（不做拖动，Pressable + onPress locationX）
  const onTrackPress = (evt: any) => {
    if (!durationMs || !trackWidth) return;
    const x = evt.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    seek((durationMs * ratio) / 1000);
  };

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, spacing.xs),
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.tornEdge} />
      <View style={styles.inner}>
        {/* Play / Pause / Loading */}
        <Pressable
          style={styles.playBtn}
          onPress={() => {
            if (isLoading) return;
            if (isPlaying) pause();
            else resume();
          }}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? '暂停' : '播放'}
          hitSlop={8}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.paperCream} size="small" />
          ) : isPlaying ? (
            <View style={styles.pauseIcon}>
              <View style={styles.pauseBar} />
              <View style={styles.pauseBar} />
            </View>
          ) : (
            <View style={styles.playIcon} />
          )}
        </Pressable>

        {/* 时间 + 进度条 */}
        <View style={styles.middle}>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{fmtMs(currentPosMs)}</Text>
            <Text style={styles.timeSep}> / </Text>
            <Text style={styles.timeTextDim}>{fmtMs(durationMs)}</Text>
            {error ? <Text style={styles.errText} numberOfLines={1}>  · {error}</Text> : null}
          </View>
          <Pressable
            onPress={onTrackPress}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            style={styles.track}
            accessibilityRole="adjustable"
            accessibilityLabel="播放进度"
          >
            <View style={[styles.fill, { width: `${progressPct * 100}%` }]} />
          </Pressable>
        </View>

        {/* Close */}
        <Pressable
          style={styles.closeBtn}
          onPress={() => stop()}
          accessibilityRole="button"
          accessibilityLabel="关闭播放"
          hitSlop={8}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.paperCream,
    // 撕纸风：无 hard shadow，用顶端小锯齿代替 top border
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 -2px 12px rgba(26, 22, 19, 0.06)' as any }
      : {
          shadowColor: colors.inkPrimary,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 8,
        }),
  },
  tornEdge: {
    height: 3,
    backgroundColor: colors.paperDark,
    opacity: 0.5,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    minHeight: 56,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    // 三角形 ▶（left-pointing filled triangle 用 border 技巧）
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.paperCream,
    marginLeft: 3, // 光学居中
  },
  pauseIcon: {
    flexDirection: 'row',
    gap: 4,
  },
  pauseBar: {
    width: 4,
    height: 14,
    backgroundColor: colors.paperCream,
    borderRadius: 1,
  },
  middle: { flex: 1, gap: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkPrimary,
    letterSpacing: 0.3,
  },
  timeSep: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
  },
  timeTextDim: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    letterSpacing: 0.3,
  },
  errText: {
    fontFamily: fonts.ui,
    fontSize: 10,
    color: colors.brick,
    flex: 1,
  },
  track: {
    height: 4,
    backgroundColor: colors.paperMain,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.brick,
    borderRadius: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: fonts.ui,
    fontSize: 20,
    color: colors.inkSecondary,
    lineHeight: 22,
  },
});
