// 生成 3 集 × 2 模型 = 6 份盲评材料（跨集比较）
import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync('spike/data/spike-016-stability-test.json', 'utf-8'));

// 按集分组
const bySource = {};
for (const r of d) {
  if (!bySource[r.source]) bySource[r.source] = {};
  bySource[r.source][r.model] = r.pack;
}

// 每集内部 A/B 打乱（用 seed 保证可复现）
let seed = 12345;
function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

const mapping = {};
let doc = `# GLM 4.6 vs 5.2 稳定性盲评

**3 集播客，每集用两个模型分别生成学习包（隐藏模型名）。请为每集内 A vs B 打分。**

**只对比同一集内的 A vs B，不同集之间不需要对比。**

## 评分维度（每维 1-10）

1. **主题准确度**
2. **核心点精准度**
3. **学习路径深度**
4. **卡片可复用性**
5. **行动实用性**
6. **中文表达质量**
7. **timestamp 合理性**

## 输出格式

对每集给出：
\`\`\`
集数 1:
  A: 平均 X.XX
  B: 平均 X.XX
  差距: |X.XX - Y.YY| = Z.ZZ
  优胜: A / B / 平手（差 < 0.3 记平手）
  一句话说明
\`\`\`

最后总结：**A/B 谁更稳定**、**平均分差多大**。

---

`;

// 每集独立打乱 A/B，避免 subagent 看出规律
let episodeIdx = 1;
for (const [source, models] of Object.entries(bySource)) {
  // 每集独立用不同 seed 打乱 A/B
  seed = episodeIdx * 7919 + 31; // 每集不同 seed
  const keys = Object.keys(models);
  if (rand() > 0.5) keys.reverse();
  const letters = ['A', 'B'];
  keys.forEach((m, i) => {
    mapping[`ep${episodeIdx}-${letters[i]}`] = m;
  });

  doc += `\n═══════════════════════════════════════\n## 集数 ${episodeIdx}: ${source}\n═══════════════════════════════════════\n\n`;
  keys.forEach((m, i) => {
    doc += `\n### ${letters[i]}\n\n\`\`\`json\n${JSON.stringify(models[m], null, 2)}\n\`\`\`\n\n`;
  });
  episodeIdx++;
}

fs.writeFileSync('spike/data/spike-016-stability-blind.md', doc);
fs.writeFileSync('spike/data/spike-016-stability-mapping.json', JSON.stringify(mapping, null, 2));
console.log('=== 稳定性盲评材料 ===');
console.log('文件: spike/data/spike-016-stability-blind.md');
console.log('大小:', doc.length, 'chars');
console.log('\n映射:', mapping);
