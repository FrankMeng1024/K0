// SPIKE-016 step 2 v2: 合并所有 6 个模型的成功结果，生成盲评材料
import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync('spike/data/spike-016-glm-compare-1783250009356.json', 'utf-8'));
const retry52 = JSON.parse(fs.readFileSync('spike/data/spike-016-glm52-retry.json', 'utf-8'));

const successful = original.results.filter(r => r.ok && r.parseOK);
// 替换 5.2 为 retry 版本
if (retry52.ok) {
  successful.push({ model: 'glm-5.2', ok: true, ms: retry52.ms, pack: retry52.pack, inTok: retry52.usage.prompt_tokens, outTok: retry52.usage.completion_tokens, parseOK: true });
}

// Fisher-Yates 打乱（seed 12345）
let seed = 12345;
function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
const shuffled = [...successful];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
const mapping = {};

let doc = `# GLM 横评盲评材料 v2

**播客**：硬地骇客 EP127 - 从 Skills 到自动化工作流，论 Agent 如何接管真实生产力
**时长**：51 分钟
**转录**：BCUT ASR (1431 segments, 38176 chars)

## 场景
用户 Frank 想要**最高质量学习包**，个人向使用（1-2 人，不考虑高日活），预算充足。以下 ${shuffled.length} 个学习包由不同 AI 模型基于同一 transcript 生成。

## 评分维度（每项 1-10 分）
1. **主题准确度**（oneSentence 是否抓住真正核心，非泛泛而谈）
2. **核心点精准度**（corePoints 具体 + 有记忆点 + 准确）
3. **学习路径深度**（steps 逻辑连贯 + 覆盖主要内容）
4. **卡片可复用性**（cards 是否点出可复用的方法/观点/反思）
5. **行动实用性**（actions 是否具体可执行）
6. **中文表达质量**（无翻译腔、无生硬）
7. **timestamp 准确度**（是否真实指向 transcript 里的时刻）

## 特别关注
- **错别字造成的语义歧义**：可扣分
- **纯错别字（不改变语义）**：不扣分
- **跳过重要内容**：严重扣分
- **数量不重要，质量重要**

## 输出

针对每个学习包 A-F，输出：
\`\`\`
学习包 X:
  维度 1: N分 - 简短理由
  维度 2: N分 - 简短理由
  ...
  总分: N.N 分（7 维度平均）
  一句话评价: ...
\`\`\`

最后给出排名：\`X > Y > Z > ...\`

---

`;

shuffled.forEach((r, i) => {
  const letter = letters[i];
  mapping[letter] = r.model;
  doc += `\n═══════════════════════════════\n## 学习包 ${letter}\n═══════════════════════════════\n\n`;
  doc += '```json\n' + JSON.stringify(r.pack, null, 2) + '\n```\n\n';
});

fs.writeFileSync('spike/data/spike-016-blind-eval-v2.md', doc);
fs.writeFileSync('spike/data/spike-016-mapping-v2.json', JSON.stringify(mapping, null, 2));

console.log('=== 盲评材料 v2 ===');
console.log('文件: spike/data/spike-016-blind-eval-v2.md');
console.log('大小:', doc.length, 'chars');
console.log('\n映射（仅主 agent 可见）:');
for (const [k, v] of Object.entries(mapping)) console.log(`  ${k}: ${v}`);
