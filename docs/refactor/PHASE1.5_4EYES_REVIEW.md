# Phase 1.5 拆表 — 4-Eyes Review (二轮，含修复)

**日期**: 2026-07-09
**范围**: learning_packs.pack_json → 8 张关系子表拆分 + updatePackContent id 稳定性 (Blocker B1)
**Commits**: 04aaeb7 (一轮修复), 99b26d8 (二轮修复)

## 四眼结论

| Reviewer | Verdict | 关键发现 |
|---|---|---|
| **Product** | PASS | B1 修复正确保护 M5「一周后仍能记得」承诺。2 个 Medium 后续项(非阻塞) |
| **Arch** | PASS | ✅ 5 个 UNIQUE 约束全部确认存在 — B1 修复是真的、非 no-op |
| **Risk** | PASS | 悬挂桥接=无害死数据(读路径全 content-first); errors.js sqlMessage 应 scrub |
| **QA** | PASS(修复后) | 一轮 BLOCK 待回归矩阵; 二轮 19/19 全过, GATE 达标 |

## Arch 确认的 UNIQUE 约束 (B1 生效前提)
- pack_cards: `uk_pack_position (pack_id, position)` ✓
- pack_core_points: `uk_pack_position (pack_id, position)` ✓
- pack_concepts: `uk_pack_position (pack_id, position)` ✓
- pack_steps: `uk_pack_step (pack_id, step_number)` ✓
- pack_actions: `uk_pack_tf_slot (pack_id, timeframe, slot_index)` ✓

全部存在且与代码 UPSERT key 精确匹配 → ON DUPLICATE KEY UPDATE 正确触发, 无静默降级为 INSERT, 无重复行。

## 二轮修复 (本次)
1. **orphan bridge 清理** (Risk): updatePackContent shrink 后, 清理 user_cards/user_step_progress/user_actions 中指向已删 content 行的孤儿 (scope by pack_id)。override 表无 pack_id 列, 留全局周期清扫 (读路径同 content-first, 悬挂无害)。
2. **errors.js scrub** (Risk): 生产环境只打 err.message; 非生产才打 stack + sqlMessage。防止 sqlMessage 回显行数据/PII 到日志。
3. **packs.js**: ErrorCode.INTERNAL → INTERNAL_ERROR (原 code 为 undefined, 仅 no-DB dev 路径)。

## QA 回归矩阵 (19/19 PASS)
- **GROW** 5→7 卡: 原 id 稳定, A 的 star 存活, 新卡走默认
- **CONCEPTS/CORE** id 稳定
- **STEP** 完成态存活 (id 稳定)
- **ACTION** commit 存活 (id 稳定)
- **MULTI-USER** 隔离: A star pos1 / B star pos0 互不干扰
- **GATE — SHRINK orphan no-crash**: shrink 到 1 卡 → 无悬挂 user_cards → GET pack 不崩 → 只返回 1 张有效卡 → A 失效 star 被清 / B 存活
- **DOUBLE-REGEN** 幂等: 两次 regen 无重复行

测试在临时 pack (id=2) 上跑, 跑完清理。验证 pack 1 原始 4 卡未受影响, 测试用户零残留。

## 遗留 (Medium, 非阻塞 — 记入 backlog)
- **P-1** (Product): position-based key 意味内容重排时 star 粘在 slot 而非 content。GLM 重生成顺序不保证稳定 → 用户可能发现 star 跑到别的卡上。需产品决策: star 是书签在 slot 还是 content? → CR 候选。
- **P-2** (Product): shrink 掉出的 starred 卡静默丢失, 用户无感知。可考虑重生成时提示。
- **A-1** (Arch): pack_core_points.point 是 MEDIUMTEXT 但未走 safeUtf8Slice (与 cards/concepts 不一致)。超大 GLM point 会 mid-transaction 抛错回滚。低概率。
- **R-1** (Risk): 并发 Step 2 regen 可能死锁 (InnoDB gap lock), 输家干净回滚(原子无半写), 但设备看到 500。可加 GET_LOCK 或 retry-on-deadlock。
- **R-2** (Arch/Risk): DELETE /packs 未清 override 表 (无 pack_id 列)。累积死数据, 无崩溃风险(读 content-first)。

以上 5 项均为硬化/后续项, 不阻塞 Phase 1.5 完成。
