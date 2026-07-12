// ai.service.js — AI 模块统一出口 (Phase 后端重构)
// 唯一对外的 AI 门面: 所有功能模块要用 AI 只从这里 import, 不直接碰 packGenerator/GLM。
// 未来换模型/换 prompt/换 provider 只改 ai/ 内部, 各 feature 不受影响。
export {
  generateSnapshot,          // Step 1: 全转录 → 快照
  generatePackFromSnapshot,  // Step 2: 快照 → 步骤+概念+卡片+行动
  generateLearningPack,      // 兼容: 串行 Step1+Step2
} from './packGenerator.js';

// #116 多篇脑图语义: embedding 走独立按量端点 (与 chat 的 Lite coding 端点物理隔离)
export {
  embedConcepts,
  cosine,
  SEMANTIC_THRESHOLD,
} from './embedding.service.js';
