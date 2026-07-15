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
// v79 (R44d, OTA 诊断): 拖动/卡顿/缩放/重排 4 问题 v78 没修好, 加交互日志到 client_logs。
// v80 (R44e, OTA): 真机日志定位根因 + 变换模型重写(画布=屏幕尺寸, fit 烘焙进坐标, 两指中点缩放)。
// v81 (R44f, OTA 关键修复): v80 引入 TDZ 崩溃(手势闭包在声明前引用 freezeFitNow)。
// v82 (R44g, OTA): 修拖动一动就飘 + library 详情框缩放后不消失:
//       飘走真因(真机日志): fit 跟随 live nodes → 拖动/收敛使 bbox 从 640 暴涨 → baseS 0.765→0.321
//       → 换算系数崩 → 球飘。改: fit 计算一次(进全屏1.2s后)永久冻结, 坐标系恒定, 拖动只在固定系里移动, 不飘。
//       library 详情框: 双指缩放时 setSelected(null) 关掉面板, 不再缩放后残留。
//       web 验证: 拖动后 out=0、中心 drift≈拖动量(非飞走)、无崩溃。
// v83 (回退): ForceGraph.tsx 回退到 v79 脑图逻辑。
// v84 (基于v79基线小步改, 3个小bug):
//       (1) 双指缩放以红点(屏幕中心)为不动点(focal 补偿 tx/ty), 不再偏。
//       (2) library 缩小(pinch)时关掉右下角详情框(onStart setSelected null), 不残留。
//       (3) 拖动球: pinDrag 停掉收敛 rAF + 只移动被拖球(不回温力模型), 其他球纹丝不动,
//           位移与手指方向距离完全一致(web验证: 拖1球只1球动 top3=[93,4,4])。松手保持pin不弹回。
// v85 (R46/47, Frank建议loading方案): 修脑图挤成一团+交叉线多。
//       根因(web复现): fitS=屏幕/大画布(0.385)与团大小无关→团只占屏29%。改 fitS 按团 bbox 铺满屏幕。
//       加 loading 状态: 收敛中显"正在整理知识脑图", 力导向完全收敛(settled/3.5s兜底)后才冻结fit+显示图,
//       用户看到的第一眼即终态(铺满/居中/交叉线散开)。web验证: loading→消失, 占屏71%×69%居中不裁。
// v86 (R48, subagent调研+单矩阵重写): 根治缩放漂/拖动飘/挤团。弃"大画布2.6x+centerTX+fitS"三层嵌套变换。
//       改单一世界矩阵 screen=world*S+T: 画布=屏幕尺寸, canvasStyle transformOrigin:'top left' 只 translate+scale。
//       fit 烧进初始 S/tx/ty(settled后一次); 缩放用 RNGH focalX/focalY 焦点公式; 拖动只除 S; charge 不再×1.7。
//       节点拖动 blocksExternalGesture(canvasPan) 隔离整图平移。web验证: 居中cx=屏幕中心/不裁/拖1球只1球动(top3=[72,1,0])。
// v87 (R49, Frank v86真机3问题): (1)遮罩小一圈+界面小 (2)拖动第一时间跳左上角那个点 (3)library退全屏残留detail。
//       根因1(界面小/遮罩): ①全屏仍带 viewport border/圆角/marginTop 圈小一圈 → 全屏改无边框无圆角(viewportFull);
//         ②fit 只在 settled 那刻烧一次, 那时力导向还在扩散 bbox 偏大 → S 算小(web实测 0.346 应 0.5+) → 图挤中间。
//         改: 用户未触碰前每次 nodes 变都重 fit(loading 盖过程), 收敛后停在正确 fit; 用户 pan/pinch/拖动→冻结。
//         web验证: 从占屏~35%blob → 铺满72%宽×69%高居中。
//       根因2(拖动跳左上角): DraggableLabel drag.onStart 在 worklet 里读 node.x → worklet 捕获创建那刻 JS 快照,
//         rAF 换 node 对象后读到旧/undefined → startX=0 → 从(0,0)左上角起跳。改 getStart() 在 JS 侧实时读 live 坐标。
//       根因3(退全屏残留): exitFullscreen 只关 Modal 没清父层 selected → 加 props.onSelect?.(null)。
// v88 (R50, Frank v87真机: 拖拽/退全屏OK, 但隐形遮罩裁切+偏移点缩放飞远): 根因=SVG 用屏幕尺寸(932×430),
//       力导向把节点吹到 bbox 超出该框, 超出部分被 SVG 自身 viewport 裁掉(Frank: "超出范围被剪切 / 之前无限大画布才全展示")。
//       偏移点缩放飞远也是同一根因(内容被推出 SVG 边缘被裁)。修法: 全屏 SVG/画布用大世界画布(CANVAS=2400, 按屏幕
//       长宽比放大成宽扁 5202×2400), 节点围绕其中心散开永不越界, 单矩阵 fit 再缩到屏幕。web验证: nodesOutsideSvgBox=0
//       (不再裁切), 铺满56%宽×68%高居中, 0 console error。保留 R49 拖动/退全屏(已 OK 不动)。
// v89 (R51, Frank v88真机: 遮罩OK, 但 root 连到观点(连接错) + 偏移点缩放严重偏离):
//       A(root连观点): buildMindGraph 里 concept 没连上其他概念/card 没匹配到 core 时兜底直接挂 center
//         → root 直连 concept/card, 层级错。改: 兜底挂到最相关/第一个 core, root 只连 core。web验证: center 5 条边全连 core。
//       B(偏移点缩放偏离): GestureDetector 之前挂在"被 scale+translate 的大画布"上 → e.focalX 在变换后坐标系,
//         与 tx/ty(屏幕系)不同系 → 焦点公式算错 → 偏移点缩放严重偏离。改: 手势挂到"未变换的屏幕尺寸 gestureLayer",
//         focalX/Y 恒为屏幕坐标。web验证(CDP合成pinch): 偏移点(250,215)缩放1.39x, 焦点漂移仅(1,0)px≈0。
// v90 (R50-54, iPad适配 + 脑图收尾, Frank夜间自主批次):
//       【脑图】① 退全屏"两次旋转"抖动: exitFullscreen 先 await 转竖屏再关 Modal(连贯一次旋转)。
//               ② 节点重叠: forceTick 加 AABB 标签盒矩形分离(_lw/_lh/_loff), web实测 circle+label 重叠均=0。
//               ③ 交叉线: R53 尝试"兄弟角度分散力"经 web 量化实测反而把交叉 26→31 变多(切向 sign 有问题),
//                  已回退到基线力模型(保留 R52 重叠分离, 实测 circle+label 重叠=0)。交叉减少留待更严谨方案。
//       【iPad 响应式】新增 useResponsive hook(isWide=宽≥900且横屏, 手机竖屏零影响)。首页方案B(顶hero+底三卡横排),
//               episode 方案A(左目录导读栏+右滚动, 章节锚点跳转), library 方案A(左filter栏+右三列网格),
//               ScreenHeader/AudioPlayerBar/CardsCarousel 宽屏限宽居中。全部竖屏零改动, web@1194×834 验证。
//       【顺手】脑图入口 ⤢ 箭头去掉(手机+iPad)。
//       ⚠️ iPad 真机横屏需 app.json supportsTablet:true + orientation 解锁 → 必须 EAS build(本次仅 OTA JS, build 待授权)。
// v98 (R55b, iPad UI 三页统一打磨, web@真实1194×834 验证):
//       【首页】卡片过大修复: row 从 flex:1 space-between(空旷中段)→ rowWrap 定高内容+顶对齐, 三卡等宽等高、无空白拉伸。
//       【library】卡片大小不一修复: cell 从 minHeight→固定 height:176+overflow:hidden, 4 张 pack 卡视觉尺寸完全一致。
//       【episode】左目录导读栏+右滚动内容确认排版一致(gutter/分割线满宽/字号统一)。
//       全部竖屏零改动; web@1194×834(=iPad等比) 全流程 Playwright 验证: home/episode/library/脑图/跨集图 0 console error;
//       脑图全屏径向树 0 无意义交叉; 跨集图 pack 节点点击→"打开这一集"跳转正确。
// v99 (R55c, iPad 安全区防贴边 — 诊断subagent发现):
//       诊断确认: build 11(commit 9598d329)已含 UISupportedInterfaceOrientations~ipad 全4方向 → iPad plist 层可旋转,
//       且 Frank 描述的"分割线短/卡片大小不一"是宽屏分支特有症状 → isWide 确在触发, v98 布局修复对症。
//       本次补 subagent 指出的真实隐患: 宽屏 root 只用 gutter 未叠加 safe-area insets.left/right →
//       iPad 横屏内容可能压到刘海/圆角。首页/library/episode/ScreenHeaderPad 全部 paddingLeft/Right += insets.left/right。
//       web insets=0 零改动(已验证 v98 布局无回归), 仅真机 iPad 安全区生效。
// v100 (R55d, Frank真机7条 iPad 反馈, 全部走首页基准统一):
//       #6 首页(基准): 内容整体垂直居中(container justifyContent center)+顶部留白加大(padTop xxxl)+卡片再大一点点(padding/插画/字号↑)。
//       #1/#3 library+学习包左侧贴边: 从 flush-left flush 满高栏 → 外层 gutter+insets 留白, 圆角 rail(content-height), bodyRow 限宽居中对齐 header。
//       #2 library 卡片大小不一(iPad): SwipeablePackCard/PreviewListRow 加 fillHeight prop → 固定高 cell 内卡片撑满, 短内容包也等高。手机不传默认按内容高(零影响)。
//       #5 review 分割线短/边距: 从手机 ScreenHeader → isWide 用 ScreenHeaderPad(满宽分割线)+内容限宽居中留呼吸。
//       #4 学习包知识卡: episode 走 library 同款(gutter+圆角rail+限宽居中), 内容加宽填充, 卡片轮播对齐内容列。
//       #7 其他页边距/风格全参照首页(gutter=屏宽6%夹28~96, contentWidth≤1040 居中, insets 叠加)。
//       手机竖屏零改动; web@真实1194×834 全流程验证 0 console error。
// v101 (R55e, 词级高亮 + Frank真机第二批 iPad 分割线/边距/大小):
//       【词级高亮(3端)】全文原文"值得听"从整段高亮→逐词高亮。BCUT ASR 本就返回字级时间戳,
//         之前存库丢弃; 现 transcript_segments 加 words_json 列(prod已ALTER)→ upsertTranscript 写入 →
//         GET /:id/transcript aggregate 拼 words 透传 → 前端按词上色。旧pack words=null 走整段 fallback(零回归)。
//       【iPad 第二批】#1 library 左栏顶部留白(bodyOuter padTop); #2/#3 卡片 2×2 固定 168h 等大一页展示;
//         #4 knowledge-map 加 iPad(ScreenHeaderPad 满宽分割线+限宽居中); #5 脑图全屏 重排/复位 加大+离角;
//         #6 episode 顶部留白; #7 review 今日/本周/已复习 评分后本地乐观更新(实时变, 3端); #8 learn 加 iPad 顶栏。
//       手机竖屏零改动; web@1194×834 全流程 0 console error。后端已热部署(prod)。
// v102 (R55f, Frank真机第三批 iPad 6 条 + 词级高亮验证):
//       #1 登录页分割线短: iPad 内容限宽居中(460)成卡片, 分割线=表单宽。
//       #2 学习包内容与左栏齐平: episode 内容顶 padding = rail padV, 首卡与"目录导读"同高起。
//       #3 左栏点击高亮: 点目录导读项→当前项砖红底白字(activeSection)。
//       #4 词级高亮"仍段落式"排查: 代码正确, 因所有旧pack 无 words(0/4258段) 走 fallback;
//          注入测试words 实测逐词高亮生效(前9字高亮/后10字不高亮), 已还原。新pack自动词级。
//       #5 library 左右卡片不等高: cell 固定176h+overflow hidden, 同行完全等高。
//       #6 knowledge-map 按钮/文字/分割线不等宽: body 去掉多余 gutter, =contentWidth 对齐分割线。
//       手机竖屏零改动; web@1194×834 全流程 0 console error。
// v103 (R55g, Frank真机第四批 iPad 6 条 — 修正上轮做偏的):
//       #1 登录页: 撤销上轮错误的限宽小卡片, 改回全屏铺满; 分割线=表单实际宽(满宽不短)。
//       #2 library 学习包/卡片网格顶边与左侧 rail 卡片顶边齐平(mainContent paddingTop=0)。
//       #3 学习包左栏: 默认高亮第一项(核心速览) + 右侧 scroll 时 scroll-spy 联动高亮当前 section。
//       #4 知识卡片轮播: K0Card 加 fixedHeight prop, iPad 每张固定 340h → 大小一致; 各 section 标题
//          加顶部分割线(borderTop)明确分段 + 卡片左右留空。
//       #5 card detail 页(app/card/[key].tsx)加 iPad 适配(ScreenHeaderPad 满宽分割线+限宽居中), 风格对齐其他页。
//       手机竖屏零改动; web@1194×834 全流程 0 console error 验证。
// v104 (R55h, Frank真机第五批 iPad 3 条):
//       #1 学习包左右不等高: rail 去掉 alignSelf flex-start → 撑满 bodyRow 全高, 与右侧内容列等高(进度沉底)。
//       #2 左栏点击弹回: 点击时程序化滚动期间(700ms)锁定 scroll-spy, 不让动画途中重算高亮覆盖点击结果 → 无弹回。
//       #3 card detail 翻面卡大小不一: cardWrap iPad alignItems stretch → 卡片=内容列宽(最大, 与分割线齐);
//          K0Card library variant 已固定 440h → 每张等大; 该页内容不超屏(无 scroll)。
//       手机竖屏零改动; web@1194×834 全流程 0 console error。
// v105 (R55i, 学习包左右等高 — 补真机 safe-area):
//       #1 学习包左右不等高(真机残留): web 实测 rail/content 已等高(635=635), 但真机 iPad 底部有 home-indicator
//          safe-area, 之前 bodyOuter 只加了 top/left/right padding 没加 bottom → 两列延伸到不同底线。
//          bodyOuter 补 paddingBottom = insets.bottom + spacing.lg → 左右两列同时止于安全线上方, 真机等高。
//       快照(quick 模式): 同 isWide 分支, rail 少几项但撑满全高, 核心速览块正常, 无布局问题(已核实代码路径)。
//       手机竖屏零改动; web@1194×834 0 console error。
// v106 (R55j, 学习包"视觉等高"= 大封面图):
//       Frank 澄清"等高"含义: 参考 library(左栏与右侧卡片视觉平衡), 学习包右侧顶部的播客封面图
//       应放大到与左栏框视觉登高 —— 不是容器高度, 而是封面图从 56px 小图 → iPad 132px 大图 +
//       标题 hero 化(26号), 右栏顶部有视觉重量, 与左栏 rail 平衡。手机竖屏保持 56px 小图不变。
//       web@1194×834 0 console error。
// v107 (R55k, 学习包顶线对齐 — 澄清版):
//       Frank 再澄清: "等高"= 封面图标的上边线 与 左侧栏的上边线 对齐(顶线等高), 右侧往上抬一点; 不是放大。
//       撤销 v106 大封面(回 56px)。内容 ScrollView 顶 padding 从 ipad.rail.padV → 0, episodeMetaRow
//       marginTop iPad→0 → 封面图 top 与 rail 卡片 top 精确对齐(web 实测 199=199)。
//       手机竖屏零改动。web@1194×834 0 console error。
//       手机竖屏零改动。web@1194×834 0 console error。
// v108 (R60, 长博客四问: 快照分段解析 + 原文无限滚动 + 3个iPad页):
//       #3+#4(核心): 快照 generateSnapshot 两路并行 —— A路 chunkSegments 分块抽 worthListening/skippable 合并去重
//         (长博客自然出8-12段, 不再被单次8192上限截断只剩3段); B路全局字段一次全文调用。仅影响新pack。(后端已部署)
//       #2 原文打不开: transcript 接口加 offset/limit 分页; episode+snapshot 原文无限滚动(滚到底自动 append)。
//       #1 快照页 iPad: ScreenHeaderPad 满宽分割线+限宽居中+决策栏居中。额外 import/goal-select 加 iPad 限宽。
//       手机竖屏零改动。web 验证: 快照满宽分割线/原文能打开+滚到底自动加载(4421→7588)/0 error。
// v109 (R62, 429彻底避开 + 2个bug):
//       核心: 永不 429 + 永不降级(只用 glm-5.2)。GLM 全局节流闸门 withGlmSlot(单飞+800ms令牌桶),
//         从物理上消除瞬时突发(v108分段并行的同秒6请求打爆 coding-plan 动态限流是 429 根因)。
//         撞 429 只对 glm-5.2 退避重试(1.5/4/9/15s+抖动, 读 Retry-After), 不降级到 flash(质量太差)。(后端已部署)
//       bug1: 生成未完成点返回会弹回进度屏 → 改模块级 once-flag, 只冷启动首次自动跳回, 之后可自由返回浏览。三端。
//       bug2: 手机开学习包空白 → episode bodyOuter/bodyRow 包裹 View 手机端 undefined style 断了 flex 链, 补 flex1。
//       手机竖屏零改动。
// v112 (R67, 快照决策状态gap + 速学导航栏补全):
//       R67-1: 快照选速学/深读后返回, Library 点开还停快照页(能重复点skip)——job 异步在跑期间 pack.mode 仍 null。
//         Library openPack 先查 pendingJob: 该 pack 有在跑 job→跳进度屏; ready→清书签按最新 mode 跳; 否则原逻辑。
//       R67-2: 速学(quick)左侧导航栏缺"完整原文"入口。完整转录 section 加 onLayout, 侧栏所有模式都加"完整原文"锚点。
//       真机验证 iPad quick: 目录导读 = 核心速览/知识卡片/完整原文。
export const OTA_VERSION = 112;

export const OTA_VERSION_MESSAGE = 'v112 · 快照决策后返回不再停快照(跳进度屏)+速学导航补全完整原文';

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
