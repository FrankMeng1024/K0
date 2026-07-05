// SPIKE-016 step 2: 生成盲评材料
// 把 6 个学习包 anonymize 后（去掉模型名），生成 A/B/C/D/E/F 盲评文档
// 给 subagent 打分

import fs from 'node:fs';

const dataFile = fs.readFileSync('spike/data/spike-016-glm-compare-1783250009356.json', 'utf-8');
const data = JSON.parse(dataFile);

// 随机打乱模型顺序（用固定 seed 便于复现）
const results = data.results.filter(r => r.ok);
const shuffled = [...results];

// Fisher-Yates with seed
let seed = 12345;
function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

// 生成盲评文档：A/B/C/D/E/F
const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
const mapping = {};

let doc = `# GLM 横评盲评材料

**播客**：硬地骇客 EP127 - 从 Skills 到自动化工作流，论 Agent 如何接管真实生产力
**时长**：51 分钟
**转录**：BCUT ASR (1431 segments, 38176 chars)
**任务**：以下 ${shuffled.length} 个学习包由不同 AI 模型基于同一 transcript 生成。请从**内容质量**角度盲评。

---

## 评分维度（每项 1-10 分）

1. **一句话主题准确度**：oneSentence 是否抓住播客真正核心（非泛泛而谈）
2. **3 核心点精准度**：corePoints 是否具体、有记忆点、准确
3. **6 步学习路径**：steps 是否逻辑连贯、覆盖播客主要内容
4. **3 张知识卡片**：cards 是否点出可复用的方法论/观点/反思
5. **行动计划实用性**：actions 的 today/thisWeek/longTerm 是否具体可执行
6. **中文表达质量**：语句自然、无生硬翻译腔
7. **timestamp 准确度**：sourceTimestamp 是否指向 transcript 里真实存在的时刻

**总分 = 平均分**（保留 1 位小数）

---

`;

shuffled.forEach((r, i) => {
  const letter = letters[i];
  mapping[letter] = r.model;
  doc += `\n\n═══════════════════════════════\n## 学习包 ${letter}\n═══════════════════════════════\n\n`;
  doc += '```json\n' + JSON.stringify(r.pack, null, 2) + '\n```\n';
});

fs.writeFileSync('spike/data/spike-016-blind-eval.md', doc);
fs.writeFileSync('spike/data/spike-016-mapping.json', JSON.stringify(mapping, null, 2));

console.log('=== 盲评材料生成 ===');
console.log('文件: spike/data/spike-016-blind-eval.md');
console.log('映射(仅主 agent 可见): spike/data/spike-016-mapping.json');
console.log('\n盲评编号 → 真实模型:');
for (const [k, v] of Object.entries(mapping)) {
  console.log(`  ${k}: ${v}`);
}
