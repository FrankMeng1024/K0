// scripts/glm-copy.js — K0 中文文案助手
// 用途：把需要过 GLM 打磨的中文 UI 文案批量喂进去，返回多组候选。
// 用法：node scripts/glm-copy.js
//   或指定单个 slot: node scripts/glm-copy.js review-empty
//
// 长期原则（记进 CLAUDE.md 之外的本项目文案约定）：
//   1. 所有面向用户的中文 UI 文字 —— 空态、按钮、错误、成功提示 ——
//      在写死代码前，必须过 GLM 至少一次，给足 Product Soul 背景。
//   2. 每次请求返回 5-8 组候选，Claude 主 Agent 挑最贴合的两组给用户拍板。
//   3. 用户挑一组后：写进代码、并把最终版加进 docs/COPY.md 作为字典。

import 'dotenv/config';

const GLM_API_KEY = process.env.GLM_API_KEY;
if (!GLM_API_KEY) {
  console.error('GLM_API_KEY missing in backend/.env');
  process.exit(1);
}

const K0_CONTEXT = `
K0 是一款 iOS 播客学习 App（中国市场，主要中文用户，双语播客混合听）。

Product Soul（不可变，来自 UI_SPEC.md）：
- 专注：一次做一件事，不刷不推荐
- 可完成：每一步都能勾选完成，用户能"读完"而不是"看完"
- 值得信赖：不夸张、不吹嘘、不用"AI"炫技

Visual Style：Cutout Illustrated 撕纸手工风。撕纸边缘、手写字、老书页拓片感、有质感的暖色。

用户画像：25-40 岁知识工作者，通勤/健身时听播客（Lex Fridman、面基、硅谷 101、张小珺访谈），学习动机是"听完能真的记住、能真的用"。反对被动消费。

3 大主入口（首页 3 卡片）：
- Learn（学）：粘贴一集播客链接 → AI 生成学习包（快照 + 6 步路径 + 卡片 + 测验 + 行动）
- Review（复习）：按 SRS 间隔重复（明天/3 天/7 天）推送需要复习的卡片，用户三选：记得/模糊/不记得
- Library（书房）：完成学习后卡片沉淀在这里，可按主题/来源/类型筛选，跨集搜索

文案调性要求：
- 中文，8-14 字最佳（不超过 18 字）
- 有文学感但不做作，避免"探索之旅""开启心灵"这类烂梗
- 避免直白翻译英文（如"暂无卡片" = No cards yet）
- 具备"手写便签"的味道，能配上撕纸风视觉
- 不用"AI""智能"这类营销词
- 不用感叹号，不卖鸡汤
`;

const SLOTS = {
  'review-empty': {
    where: 'Review 卡片 tag（首页 Review 入口的小副标题），当用户还没有任何收藏的卡片进入复习队列时显示',
    functional_meaning: '功能上是"复习队列为空"。核心是 SRS 间隔重复；只有当用户收藏了卡片后，卡片才会进入复习队列。用户点进 Review 屏也是空的。',
    current_draft: '收藏一张卡片就能开始',
    user_feedback: '太直白、不贴合功能。"收藏"这个动词太浅表，用户不知道为什么要收藏；"开始"也是空话。需要更能激起兴趣、体现"复利/沉淀感"的表达。',
    max_length: 12,
  },
  'library-empty': {
    where: 'Library 卡片 tag（首页 Library 入口的小副标题），当用户还没完成任何一集学习、卡片仓库为空时显示',
    functional_meaning: '功能上是"个人知识库为空"。用户完成一集播客学习后，那集生成的 5-10 张知识卡片自动沉淀进 Library。核心是"沉淀、积累"，不是"完成才有"。',
    current_draft: '完成一集就会有卡片',
    user_feedback: '太直白、像使用说明书。用户想看到的是"这里是我的知识仓库"的期待感，而不是操作条件。需要更有"书房、藏"的文化质感。',
    max_length: 12,
  },
};

async function askGlm(slotKey, slot) {
  const prompt = buildPrompt(slot);
  const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';

  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GLM_MODEL || 'glm-5.2',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        top_p: 0.95,
      }),
    });
    const data = await res.json();
    if (res.ok && data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    const errCode = data?.error?.code;
    if (errCode === '1305' && attempt < MAX_ATTEMPTS) {
      // 限流：指数退避重试
      const wait = 5000 * attempt;
      console.error(`  [attempt ${attempt}] 1305 限流，等待 ${wait / 1000}s 后重试...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    console.error(`GLM error for ${slotKey}:`, data);
    return null;
  }
  return null;
}

function buildPrompt(slot) {
  return `你是一位苛刻的中文文案总监，为 K0 App 打磨一句 UI 文案。

${K0_CONTEXT}

---

现在的任务：
**文案位置**：${slot.where}
**功能语义**：${slot.functional_meaning}
**当前草稿**：「${slot.current_draft}」
**用户不满**：${slot.user_feedback}
**长度上限**：${slot.max_length} 字

要求：
1. 给出 10 组候选，每组一行，每行 3-${slot.max_length} 字。
2. 每组下面用一行小字说明为什么。
3. **全部要白话中文**——像朋友对朋友说话，通顺、自然、口语。禁止古文、禁止半文半白、禁止倒装。
4. 允许克制、允许简短、允许留白，但每一句读起来都要"话是通的、意思是清楚的、不需要脑补"。

**禁用词库**（一个都不能出现）：
探索、开启、征程、旅程、心灵、成长、生根、聚沙、成塔、汇流、汇智、汇成、珠玑、慧海、慧根、无边、宝藏、财富、腋成裘、集腋、点滴积累、书卷、共赴、启程、蓄势、蓄能、绽放、飞跃、领悟、感悟、启迪、素纸、旧纸、书脊、册页、笺、卷、慧、悟、藏、册、簿、笺、卷轴、书房、书斋。

**禁用套路**：
- 不要文言：不要"未、已、之、乎、者、亦、尚、暂、此、彼"
- 不要器物古典意象（书签/书脊/册/卷/纸/墨/砚）
- 不要成语堆砌（"A成B""A而B"）
- 不要说教型比喻
- 不要 "先去...再来..." 这种反直觉花招

**正确方向示例**（气质参考，不是候选）：
- "这里还是空的"
- "先去学一集看看"
- "还没有可以看的"
- "过几天再来看看"

允许极简，允许直白，只要**读起来自然、像一个真人说的话**。

直接输出 10 组候选。格式：
候选一行
    - 说明一行`;
}

const which = process.argv[2];
const targets = which ? [which] : Object.keys(SLOTS);

for (const key of targets) {
  const slot = SLOTS[key];
  if (!slot) {
    console.error(`Unknown slot: ${key}. Available: ${Object.keys(SLOTS).join(', ')}`);
    continue;
  }
  console.log(`\n════════════════════════════════════════════`);
  console.log(`SLOT: ${key}`);
  console.log(`当前草稿：「${slot.current_draft}」`);
  console.log(`════════════════════════════════════════════\n`);
  const out = await askGlm(key, slot);
  console.log(out || '(GLM 无返回)');
}
