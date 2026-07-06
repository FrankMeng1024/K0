// K0 OtaBadge — 首页右上角浮动版本号 + 自动 OTA
// 灵感来自 Cairn OtaBadge，K0 简化版：
//   - v<N> · 状态  一个 pill 就够
//   - 挂载自动 checkForUpdate → 有更新自动 fetch → 自动 reload
//   - Frank 打开 App 眼睛一瞄数字变了 = OTA 落地
//
// 使用：<OtaBadge /> 放在 app/index.tsx 内，绝对定位在 SafeArea 顶部右侧。
//
// Version 递增规则：每次 `eas update --branch production` 之前 +1，永不回退。

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, ActivityIndicator, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/constants/theme';

// ===== OTA 版本号 =====
//
// 递增历史：
//   5 — Sprint 8 Loop 29+30：Library + Review MVP 真实实现
//       • Library 屏（2 tab: 学习包/卡片, 4 类型 filter, ★收藏 filter）
//       • Review 屏（SRS 翻牌 + 3 rating 记得/模糊/不记得, 简化 SM-2）
//       • Home 动态 tag: "今天有 N 张待复习" + "N 张卡片"
//       • 后端 /api/library + /api/review 全套端点
//   4 — Sprint 8 全量交付（28 loops）：修 15 bug + 5 新功能
//       • 完整转录展开面板（懒加载 + [mm:ss] 时间戳）
//       • 错别字识别提示（黄条 typoBlock）
//       • 知识卡片 ★/☆ 收藏切换（DB 持久化）
//       • 播客封面图 56x56
//       • 6/6 步骤完成庆祝 chip
//       • 长播客稳定性：BCUT 412/429/5xx retry + 15min DL + 30min ASR poll
//       • fetch 30s AbortController + inline 错误 UX
//       • 4-phase 进度展示（downloading/downloaded/uploading/poll）
//       • 失败页可"回首页重试"预填 URL
//       • Xiaoyuzhou podcast name 修复 + Apple cover 提取
//       • 步骤进度 DB 持久化（user_step_progress）
//       • 全流程 iPhone SE/14/15 Pro Max 三视口验证 0 error
//   3 — Sprint 7 修复：Learn 屏（首页 Learn 卡片进入的那个）也走新 URL→pack
//       流程。原代码走 Sprint 2 老路径 /api/episodes/import 已在生产环境返回
//       500，导致粘 URL 报"出了点问题"。现在 URL 直接跳等待屏。
//   8 — Sprint 10 PRD Must-Have 收尾：
//       • 概念解释器（Episode 页 ConceptsPanel，三层展开）
//       • 卡片删除 UI（archived + confirm dialog）
//       • 卡片"我的应用"字段（GLM myApplication + personal_note 覆盖 + inline 编辑）
//       • 行动清单 → Review "你的承诺"（migration 006 user_actions + 4 endpoints）
//       • 测验题（QuizPanel，MCQ + short 答题 + 得分汇总）
//       • 闪卡模式 sanity check（Sprint 8 Loop 30 已实装）
//       • worthListening/skippable prompt 稳定输出
//       • Backend 新 endpoints 已部署到 systemd（k0-api.service）
//   7 — Sprint 9 v7 CRASH HOTFIX：v6 因 push init 静态 import 崩溃，回退移除
//   2 — Sprint 7 收尾：新增 OtaBadge 组件，OTA 版本 pill 首次上线。
//   1 — Sprint 7 首次 OTA：URL→pack→episode 全链路 + reshapePack Blocker 修复 +
//       stepNumber 映射 + 等待屏 3-stage 动画 + 错误状态。
//
export const OTA_VERSION = 8;

type OtaState = 'checking' | 'idle' | 'downloading' | 'ready' | 'applying' | 'error';

export function OtaBadge() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<OtaState>('checking');
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Ready 状态呼吸动画
  useEffect(() => {
    if (state === 'ready') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      pulseLoop.current = loop;
      loop.start();
    } else {
      pulseLoop.current?.stop();
      pulse.setValue(1);
    }
    return () => { pulseLoop.current?.stop(); };
  }, [state]);

  // OTA 检查 + 自动下载 + 自动 reload
  useEffect(() => {
    // Web / dev 环境 expo-updates 不可用 —— 直接进 idle 显示版本号即可
    if (Platform.OS === 'web') {
      setState('idle');
      return;
    }

    let cancelled = false;
    const TIMEOUT_ERR = 'ota-timeout';
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(TIMEOUT_ERR)), ms);
        p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
      });

    (async () => {
      try {
        const Updates = await import('expo-updates');
        if (!Updates.isEnabled) {
          if (!cancelled) setState('idle');
          return;
        }
        const check = () => withTimeout(Updates.checkForUpdateAsync(), 30_000);
        let result;
        try {
          result = await check();
        } catch (err: any) {
          if (cancelled) return;
          if (!String(err?.message || err).includes(TIMEOUT_ERR)) throw err;
          result = await check();
        }
        if (cancelled) return;
        if (!result.isAvailable) {
          setState('idle');
          return;
        }
        setState('downloading');
        const fetch = () => withTimeout(Updates.fetchUpdateAsync(), 60_000);
        try {
          await fetch();
        } catch (err: any) {
          if (cancelled) return;
          if (!String(err?.message || err).includes(TIMEOUT_ERR)) throw err;
          await fetch();
        }
        if (cancelled) return;
        setState('applying');
        // 短暂展示 "重启中" 再 reload，避免像崩溃
        setTimeout(() => { Updates.reloadAsync().catch(() => {}); }, 600);
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handlePress = () => {
    // error 状态点击重试
    if (state === 'error') {
      setState('checking');
      import('expo-updates').then(U => U.reloadAsync().catch(() => setState('error')));
    }
  };

  let dotColor: string = colors.olive;
  let label = '';
  let showSpinner = false;
  let interactive = false;

  switch (state) {
    case 'checking':
      dotColor = colors.olive; label = '检查中'; showSpinner = true; break;
    case 'idle':
      dotColor = '#4A9F3E'; label = '已是最新'; break;
    case 'downloading':
      dotColor = colors.sapphire; label = '下载中'; showSpinner = true; break;
    case 'ready':
      dotColor = colors.yolk; label = '已就绪'; interactive = true; break;
    case 'applying':
      dotColor = colors.sapphire; label = '重启中'; showSpinner = true; break;
    case 'error':
      dotColor = colors.brick; label = '点此重试'; interactive = true; break;
  }

  return (
    <Animated.View
      style={[
        styles.wrap,
        { top: insets.top + 8, transform: [{ scale: pulse }] },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={handlePress}
        disabled={!interactive}
        style={({ pressed }) => [styles.badge, pressed && interactive && styles.badgePressed]}
        accessibilityRole="button"
        accessibilityLabel={`OTA 版本 ${OTA_VERSION} 状态 ${label}`}
      >
        {showSpinner ? (
          <ActivityIndicator size="small" color={dotColor} style={styles.spinner} />
        ) : (
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
        )}
        <Text style={styles.label}>{`v${OTA_VERSION} · ${label}`}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    zIndex: 1000,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paperCream,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.paperDark,
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 3,
  },
  badgePressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  spinner: {
    marginRight: 6,
    transform: [{ scale: 0.7 }],
  },
  label: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    letterSpacing: 0.2,
  },
});
