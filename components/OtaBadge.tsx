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
//  51 — Sprint16 R23-fix2 音频 stop 真根因 + library 误触发 AI:
//       [1] 音频 X/跳转/互斥都停不掉声 真根因: expo-audio remove() 不保证停播(iOS 原生继续响),
//           R14 曾因裸 pause() 崩溃删掉了它 → 恢复 pause()(严格 try/catch 兜住不崩)再 remove, 才真停。
//       [5] 点 library 学习包闪 "AI 正在生成": episode jobStatus 初始恒 'processing' 误导。
//           无 jobId(直接打开已有包)起始改 'loading' 中性态; 有 jobId 才 'processing'。已 web 实测 4 次进出无误报。
//  52 — Sprint16 R23-fix3 学习包页去闪烁+去卡死 (Frank: 已完成的包就是个简单 select):
//       episode 直接打开已有包改走 React Query (usePack, 与卡片页同源) —
//       [闪烁] 再进命中缓存立即渲染, 无 loading→content 翻转 (卡片页本就不闪=因为用了它)
//       [卡死] 旧 imperative fetch 的 catch 在 goal 存在时啥都不做 → 快速进出某次 fetch 失败就永远卡"加载中";
//              React Query 有 error 态, 不再死。删掉纠缠的 AppState 监听(React Query focusManager 已接管)。
//       web 实测: 8 次极速进出 0 卡死, 全部直出内容。
//  53 — Sprint16 R25 真实用户视角修 quote编造+值得听空+概念UI+转录高亮:
//       [致命] 卡片 quote 编造(真实用户核对原文10张卡无一句真原话)→ 后端 findQuoteRealStart 逐卡校验,
//         真实原话打引号+真时间戳, AI改写的 quote_verified=false 前端不打引号不冒充原话(守"编造=致命"红线)
//       [值得听] 下拉展开空 → quote_paragraph 落库(加DB列)+返回, 前端展开显示原文(空时友好提示)
//       [概念UI] "原文语境"超长不换行/格式乱 → 时间戳独立一行+原文全宽换行
//       [转录] 时间戳 NaN 防护 + "值得听"段落在完整转录里黄底高亮
//       [可靠] GLM fetch 加 180s 超时兜底(曾 304s 才 fetch failed 白等)
//  55 — Sprint16 R28-fix 真实用户(VU)挑刺修复:
//       [VU-a 漏引号] findQuoteRealStart/SegmentId 加跨段拼接匹配 — quote 横跨 2-3 段时也能校验,
//         不再"明明原话却不打引号"。pack3 实测: 0 张 unverified-有quote(原来有), 18/20 真引号。
//       [VU-b 致命] steps 的 AI归纳标签根本没渲染 — 根因: episode 页 mappedSteps 丢了后端 citations/aiSynthesized,
//         还伪造 sourceTimestamp。改用后端真实 citations + aiSynthesized → "AI 归纳"标签/"原文出处"正确显示。
//       [VU-c] 框架卡(无引号 AI 提炼)加"AI 提炼"chip, 区别于原话卡, 不让用户误以为漏引号。
//       [VU-d] 主动回忆闭环: 上次自评"不记得/模糊"的题排前 + 顶部提示"还有N题没答稳先练起", 全答稳提示隔几天再测。
//  67 — Sprint16 R35 脑图 v2(调研NotebookLM+Frank反馈): ①动态高亮(点节点→相连边/邻居呼吸高亮,
//       其余淡到0.12几乎隐身, 解决连线乱) ②渐进披露(默认只显主旨+核心观点, 点核心观点▸才展开概念/卡片, 解决拥挤)
//       ③纸质UI对齐(暖色brick/yolk/olive/paperCream + 墨色brown描边 + paperMain纸底, 去技术感蓝块; 库入口卡改纸质)
//       (横屏需expo-screen-orientation原生模块留下次build; 多篇embedding语义待GLM充值)
//  68 — Sprint16 R36 多篇脑图 embedding 真语义串联 (路 A 落地):
//       后端 embedding.service.js 走独立按量端点 (与 chat 的 Lite /coding/ 端点物理隔离,
//         代码级断言杜绝串线); embedding-3 1024维 + 批量 + 内存缓存 + 1113/失败静默回退。
//       /library/knowledge-graph 服务端算跨 pack 语义边 (余弦≥0.72), 前端优先用, 无则字面兜底。
//       实测: 人工智能↔AI创业 0.800 连, ↔咖啡 0.657 不连 —— 真懂"讲同一个东西"(电脑=PC=计算机)。
//  69 — Sprint 16 R36-R37 (Frank 真机反馈一批):
//       • 脑图力导向重构: 弃静态放射, 改 force-directed (charge/link/center/collision 四力, 纯JS)
//         → 节点动态散开、可拖动重排、连线交叉大幅减少 (参考 Obsidian)。收敛300帧~5s后停省电。
//       • 脑图 UI 美化: 去红黄纯色球, 改低饱和暖色纸质风 + 大小编码 + 标签渐进披露 + 语义边贝塞尔虚线。
//       • 多篇图谱改 Obsidian 式二分图: 概念本身成节点, 两篇共享概念经概念节点自然成网 (非文章直连)。
//       • 单篇/多篇脑图统一共享 ForceGraph 组件 + useMindForce hook。
//       • 图片 debug 上传修复: 弃 fetch(uri).blob() (RN 读本地URI空body→400), 改 expo-file-system uploadAsync。
//       • 深读提质: 卡片跨块去重 (19→14, 消重复注水) + 概念抽6-8个覆盖学术/人物/哲学 + 方法论步不再摆烂。
// v70 (R38, EAS build): 图片上传彻底修好(后端列名对齐+路由绕401, 真机往返验证) + 前端30s超时防卡loading;
//       脑图碰球飞走修复(近距斥力封顶+单帧位移封顶) + 球缩小 + 标签不重叠(碰撞半径含标签足迹)。
// v71 (R39, EAS build): 脑图全屏真横屏(点⤢锁横屏, Modal独占只显脑图, 横屏大画布重新自适应铺满不挤压);
//       概念/卡片时间戳定位修复(长匹配优先, 修"读空气"锚到2:00错位); 内嵌禁画布pan(修拖动带动整页滚动)。
// v72 (R40, OTA — 横屏原生能力 v71 已含, 纯JS改动): 脑图交互重构 (Frank: 竖屏不用展开, 直接切全屏看完整):
//       • 竖屏不内嵌脑图, 只给"全屏查看知识脑图"入口按钮; 点了进全屏横屏。
//       • 全屏默认全部节点展开 + 标签一律显示(不再靠缩放/点core才展开) → 修"展示不全"。
//       • 点节点 → 只显它 + 所有直接连接节点, 其余隐掉 + 底部详情面板(听原文/看卡片, 跳转前先退全屏)。
//       • 多篇图谱: 点概念看"哪些学习包讲到它", 一行一个可跳转到对应集。
// v73 (R41, OTA): 修图片上传真机超时 —— DebugUploadZone 的 API fallback 原为 localhost:3002
//       (EXPO_PUBLIC_API_URL 未进 bundle 时真机连本机失败), 对齐 lib/api.ts 改 https://api.k0.yiiling.cn。
//       服务器端另修: .env DB_HOST 公网IP→127.0.0.1, 5MB blob INSERT 28s→0.16s (已生效, 无需OTA)。
// v74 (R42, OTA): 脑图两个真机问题 (Frank 图确认):
//       • 全屏 fit-to-viewport: 力导向收敛后节点聚一团/偏角落, 现自动缩放居中铺满画布(修"展示不全")。
//       • 点节点只显相邻一个层级(层级差≤1): 单篇点主旨只显核心观点, 不再跳级冒出 concept(对齐 library)。
// v75 (R43, OTA): 脑图两处修正 + 诊断 (Frank 真机 v74 仍反馈):
//       • 点节点改回 library 效果: 不关联节点"变暗淡"留原位(OPACITY.dimNode/dimEdge), 不再隐藏+放大重排。
//       • fit 不再依赖选中 → 点节点视图稳定, 只暗淡。层级过滤(#4)保留但只作用于"变亮"范围。
//       • 全屏展示不全(#3)web 测不出: 加诊断日志, 进全屏 3.5s 后上传 win/canvas/fit/bbox 到 client_logs 供分析。
// v76 (R44, OTA): 脑图三件事 (Frank 真机诊断日志定位根因):
//       • 全屏铺满(核心): 真机日志显示节点团 455×632(竖高) vs 横屏画布 932×430(宽扁), fit 只能缩到0.554。
//         修法=播种阶段横向拉开(stretchX≈aspect), 团直接铺成宽扁(实测 aspect 0.72→2.29, 横向占比 31%→71%)。
//         所有节点全 load + fit 一次性 zoom 到屏幕, 可再手动缩放。不靠力收敛(太弱)。
//       • library 绿点(pack)点击 → detail 面板"打开这一集"跳转(之前只 concept/card 能跳)。
//       • detail 面板 UI 打磨: kind chip + 圆角阴影 + 主色实心跳转按钮。
// v77 (R44b, OTA): 脑图全屏"遮罩裁剪"根因修复 + 拖动手感 (Frank 真机反馈):
//       • 真因: SVG 固定成屏幕尺寸(932×430)+overflow hidden, 铺开的球超出即被裁(Frank 看到"比屏幕小的遮罩")。
//         修: SVG/canvas 改用足够大的虚拟画布(装下所有节点+边距, 按 bbox 算, 居中), fit 把大画布 zoom 进屏幕。
//         web 验证(932×430): 23 球全部在屏幕内 outOfScreen=0, 不再裁。即 Frank 要的"load 全部再缩放"。
//       • 拖动球飞左修复: 拖动位移除以 (fit.s × 用户缩放), 之前漏 fit.s → 球跟手精确。
//       • 拖动不弹回: 松手后球保持 pin 留在拖到的位置, 只极轻松弛邻居(alpha 0.05), 速度慢不剧烈。
// v78 (R44c, OTA): 脑图 5 个小问题 (Frank 真机反馈):
//       • 移动过敏/卡顿 + 缩放"转一下又转一下"根因: fit 依赖 nodes → 每帧 rAF 重算画布/缩放 → 映射漂移+反复重排。
//         改: 画布尺寸固定(屏幕 2.6 倍, 不随节点变), fit 恒定 → 拖动映射稳定跟手、缩放不再反复重排。
//       • 重排回最初位置: reheat 重置节点到初始 seed 坐标 + 清 pin, 而非原地重新松弛。
//       • library 知识图谱返回按钮下压: 去掉 root 的重复 paddingTop insets.top(ScreenHeader 已含)。
export const OTA_VERSION = 78;

export const OTA_VERSION_MESSAGE = 'v78 · 脑图拖动/缩放/重排修复';

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
