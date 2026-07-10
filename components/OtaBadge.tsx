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
//  20 — Sprint 13 v20 二轮 22 问题修复：
//       • 首页 header 真等高 (justifyContent space-between)
//       • Review 图标改沙漏 + Review 卡黄底改深色字 + Review dashboard
//       • Learn 页统一 ScreenHeader + AI 进度屏上移
//       • 学习包 header 换 ScreenHeader + 极简 divider + 回退首页 + 学习步骤点变色不展开
//       • 卡片重构：KnowledgeCard 组件（整卡可点翻面 + 撕纸风 + 时间戳中性色）
//       • 删除弹窗改 ConfirmDialog 撕纸风（禁 native Alert）
//       • Library filter 位置统一到 tab 下方 + mode 显示修复 + useFocusEffect 实时更新
//       • BubbleTag 背景 white→paperCream 消除"右上白点"
//       • 快照转录改段落卡片式 + skippable/worthListening 同 UI
//       • Prompt v5：60min+ 播客 week/longterm 强制填
//  19 — Sprint 12 v19 hotfix：
//       • OVERSEAS_SOURCE 错误分类：BBC/a16z/Lex 等海外 RSS 明确说 "海外源不可达"
//       • 用户看到具体域名（如 podcasts.files.bbci.co.uk）+ "未来会支持代理"
//  18 — Sprint 12 v18 hotfix：
//       • 修按钮尺寸不一致（"直接重试" vs "回首页" 高度差 1px + minWidth 对齐）
//       • 修 "fetch failed" 泛错误信息 → SOURCE_UNREACHABLE / APPLE_FETCH_ERROR 分类
//       • 用户提示改为可 actionable："播客源暂时无法访问，稍后重试或换一集"
//  17 — Sprint 12 v17 Frank 22 问题修复大集合：
//       Bug 修：#17 卡片删除崩溃 (Alert static import) / #1 emoji 乱码
//       UI：#2 删"正在处理"底部条 / #3 删进度条上分割线 / #4 header 分割线换 minimal
//       #10 Learn 删"今天可开始" chip / #14 worth/skip · bullet 换撕纸卡
//       #15 步骤缩进对齐 / #6 价值分扣分原因 / #7 X 胖字体
//       卡片重构 CR-013：quote+insight+context+myNote (删 type/core/usage/challenge)
//       行动 CR-017 允许空 / 转录 CR-016 段落制 / 快照 CR-015 禁左滑
//       Review 翻面显示新 quote+context / SRS 5/5 mock 测试通过
//       Prompt v4：Step 2 卡片新字段 + valueScoreRationale + actions 可空
//       ai_call_logs.call_type VARCHAR(30 → 80) 修 Data too long
//  16 — Sprint 11 v16 hotfix：
//       • Bug 1: Step 2 (学习包生成) 改走 job pattern，异步 + 轮询 + AsyncStorage 持久化
//         → 修 用户切后台/冷启动导致精学过程丢失、内容不出、回首页问题
//       • Bug 2: importUrl.js promptVersion 硬编码 v2 vs packGenerator v3 → dedup 失效
//         → 修 第二次贴同 URL 报 "Duplicate entry '2-quick_understand-glm-5.2-v3-ready'"
//       • 快照页 decide('deep') 现在跳 /import/[jobId]?targetPackId=X&targetMode=deep 等待屏
//       • Home 冷启动恢复支持 Step 2 job (读 targetType='pack-generate')
//  15 — Sprint 11 v3 方案 v2 完整实现：GLM 拆两步 (Step 1 快照 + Step 2 学习包)
//       + 新快照页 + 学习包页 mode 参数 + Library 4 tab (mode 筛选)
//       + Review 闪卡背面 core+usage+challenge + ScreenHeader 组件
//       + 7 个 CR (删测验/删5目标/卡片8字段/动态密度3-18等)
//       SPIKE-010 已验证 3 轮连跑 0 次 429
//  14 — Sprint 10 v14: 首页 header 等高对齐 (heroSize minHeight) + entriesBlock flex 均分吃满
//       + Library 空态美化（icon + 标题 + CTA）+ Review 空态文案改白话
//  13 — Sprint 10 v13: header 分列（左 Listen./Learn. 两行，右耳机图）+ 粘贴句独立一行
//       + 修 space-between 造成的分割线上下大空白 + 版本 popup 副标题动态化
//  12 — Sprint 10 v12: 标题和耳机图真正同一行（Row 布局：文字左 flex:1，耳机图右）
//  11 — Sprint 10 v11 首页微调：
//       • 卡片图标改到右侧同行（文字左、icon 右，去掉箭头）
//       • 3-tap 弹版本 popup 改绑到耳机插图（不再是标题文字）
//       • 生产 DB 业务表清空，测试空态
//  10 — Sprint 10 v10 首页美学重构：
//       • 删 Hello learner + 删 footer "今天的学习不消费" + 删 PasteBar
//       • Modal-only OTA badge，点击 hero 3 次弹版本 popup（隐藏 debug 入口）
//       • 首页 ScrollView → 一屏 flex 布局（iPhone SE 375×667 完整可见）
//       • 分割线宽度对齐卡片
//       • 空态动词引导：Review "收藏一张卡片就能开始"、Library "完成一集就会有卡片"
//   9 — Sprint 10 v9 HOTFIX：修 EXPO_PUBLIC_API_URL 未在 OTA bundle 生效
//       导致 v8/v8.1 API_BASE=localhost:3002，手机端"网络连接失败"。
//       eas update 用 shell env + .env.local，不读 eas.json build.env。
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
//  33 — Sprint 16 R5 关键修复：
//       Backend（已重启部署）:
//         • review.js /stats 数字类型强转 Number()（修 SUM 返回 BigInt string → 前端拼接 "0001"）
//         • library.js /cards SQL 加 quote/insight/context 字段（修卡片 tab 只显示 podcast 名）
//         • library.js /cards 过滤 archived=true（永久删除生效）
//         • packGenerator.js findQuoteRealStart 后处理：GLM 返回后用 quote 前 15 字符在 transcript
//           搜真实 segment.start，替换 GLM 给的不准 startSec（音频播放位置对准 quote 第一字）
//         • 同上处理 skippable.startSec
//       前端:
//         • review.tsx rate() 完成后 refetch /api/review/stats（不再乐观累加，防字符串拼接）
//         • review.tsx load stats 也 Number() 强转
//         • audioPlayer.tsx 去掉前端 -N 秒 buffer（后端已 findQuoteRealStart 精确）
//         • snapshot/episode/card 页 useFocusEffect cleanup 调 audioPlayer.stop()（页面切走音频停）
//         • SwipeablePackCard: mode 决定显示（deep: X/6步·Y卡片, quick: Y卡片, skip/null: 快照·可升级）
//         • library.tsx cards tab: 主标题 = insight/title, 正文 = quote/explanation
//  47 — Sprint 16 R22 四修:
//       [Bug1] Library 从 skip tab → Learn 粘贴新 URL → 回 Library 学习包空
//         Root cause: useFocusEffect 只 reload 不 reset modeFilter，
//           新 quick/deep pack 不在 skip tab 里 → 视觉空。
//         Fix: focus 时把 modeFilter/cardFilter 重置回 'all'
//       [Bug2] 删卡后卡片停留反面
//         Root cause: React key 用 card.id (含 packIdNum*1000+i)，删卡后
//           reshapePack 用新 i 生成同样 id → React 复用 K0Card → 内部
//           flipped state 不 reset → 显示反面。
//         Fix: key 改为稳定的 cardIndex，删卡后 unmount+remount 显示正面。
//           + activeIdx 越界 clamp
//       [Bug3] Library 学习包卡片下方加今日目标状态
//         Backend /library/packs 加子查询 today_total / today_done。
//         SwipeablePackCard 副行显示 "今日目标 N/M 待完成" 或 "✓ 已完成"
//       [Bug4] 本周/长期目标几乎不生成
//         Prompt v6: actions.today/thisWeek/longTerm 三字段强制 15-50 字
//           动词开头，禁空占位，附示例。
//         packGenerator.js safeActions 兜底：GLM 漏则填通用文案，杜绝空。
//  48 — 三层大重构 (2026-07): 前端结构重组 (组件全抽离 + hooks/React Query 数据层
//       服务器权威) + 后端按功能 MVC (features/ + ai/ 独立 + shared/) + AI 结构化日志。
//       纯结构重构, 功能零改动, API 路径不变。修 3 个 latent bug (库 mode 筛选失效 /
//       fmtTs 0 显示 / refetch 不稳定)。
//  49 — Sprint16 R23 真机 7 bug 修复:
//       [1] 音频 URL 反转义 &amp; (RSS 实体损坏播放) + 横条 zIndex 保证不被遮
//       [2] 返回按钮文案 "首页"→"返回"; 生成流程返回回首页(不回 learn)
//       [3] 删卡后整批 remount 复位正面 (不再显示下一张背面像没删)
//       [5] 卡片收藏纯乐观更新, 去 refetch 消除闪烁
//       [6] 卡片跳学习包传服务端 mode, quick 包不再套 deep 空壳(只显标题)
//       [7] 删除卡片"方法/观点/洞察"死 filter (v4 卡片模型无 type 字段)
//       [4-后端] 精学 GLM JSON 截断抢救 + deep 卡片上限 18→12 (修生成失败)
//  50 — Sprint16 R23-fix 真机 8 bug 二次修复 (v49 未真修好的回归):
//       [1] 音频回归真根因: 恢复 v36 root 级 usePathname 停音频 (替掉每页 useStopAudioOnBlur
//           时序不稳导致横条闪没/不互斥) + 修 AudioPlayerBar hooks 违规(early-return 移到 hook 后)
//       [2] 清干净所有 "‹ 首页" back 按钮 (goal-select + import/AI提炼页, 上次只改了 ScreenHeader)
//       [3] 登录 token 不再落盘(只内存) → 每次开 App 回登录页(记住只预填账密), 不自动进 home
//       [4] 概念标签 "小白解释"→"一句话解释"
//       [4.1-后端] 速学→精学 mode 变化时复位 archived(un-hide 被删旧卡), 保留 starred+手写笔记
//       [4.2] 行动计划 key/值归一 (week→thisWeek 数组→字符串), 修今日勾选传数组崩→"跳掉"
//       [5] 收藏跨页: star 后写 React Query 缓存(['pack',id]), 退出再进不回退旧收藏态
//       [6] 卡片跳学习包传服务端 mode → quick 包完整渲染(已 web 实测)
export const OTA_VERSION = 50;

export const OTA_VERSION_MESSAGE = 'v50 · 8 bug 二次修复(音频回归/登录/收藏跨页/精学重生成/行动计划)';

type OtaState = 'checking' | 'idle' | 'downloading' | 'ready' | 'applying' | 'error';

export function OtaBadge({ inline = false, invisible = false }: { inline?: boolean; invisible?: boolean } = {}) {
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

  // Sprint 10 v10: invisible 模式仅保留 OTA 自动检查+下载逻辑，不渲染任何 UI
  if (invisible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        inline ? styles.wrapInline : styles.wrap,
        !inline && { top: insets.top + 8 },
        { transform: [{ scale: pulse }] },
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
  wrapInline: {
    // 在 Modal 内部使用，不占绝对定位
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
