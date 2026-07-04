# SPIKE-006: Expo EAS Build 从 Windows 出 iOS TestFlight 包

**Epic**: E-007 Foundation（新增，因 CR-001）
**Sprint**: Sprint 2（从 Sprint 1 顺延）
**Points**: 3
**Owner**: DevOps + Frontend
**Status**: Todo — Credential-Dependent（详见 Notes）

## Description
As Arch, I want to verify Windows 开发机能通过 Expo EAS Build 云构建出 iOS `.ipa` 包并上传到 TestFlight。因为用户是 Windows 环境，本地无法跑 Xcode，必须依赖 EAS 云构建。

## Expected Result
- 在 Expo 项目里配置 `eas.json`（development / preview / production 三个 profile）
- 用户注册 EAS 账号（如未有）+ 关联 Apple Developer Team ID
- 首次跑 `eas build --profile preview --platform ios` 云构建
- 构建产出 `.ipa`
- `eas submit --platform ios` 上传到 App Store Connect
- 上传后在 TestFlight 内部测试组可见
- 用户可在自己 iPhone 上装 TestFlight app → 装 K0 preview 版
- `docs/spike-results/SPIKE-006.md` 记录：eas.json 内容、构建 log 关键片段、上传 log、TestFlight 截图

## Acceptance Criteria
- [ ] `eas build` 云构建成功（wall-clock 一般 15-30 分钟）
- [ ] `.ipa` 产物可下载
- [ ] `eas submit` 上传 App Store Connect 成功
- [ ] TestFlight 内测组可见
- [ ] 用户 iPhone 上 TestFlight 显示 build 并能安装
- [ ] `docs/spike-results/SPIKE-006.md` 完整含用户 apple id / team id 相关信息（脱敏）

## Dependencies
- **[BLOCKING]** Apple Developer 账号（用户确认 Cairn 用同账号 → 有）
- **[BLOCKING]** Bundle ID `com.yiiling.k0` 需在 App Store Connect 手动建 App（首次 SPIKE-006 前用户在网页端操作 ≈ 5 分钟）
- **[BLOCKING]** 用户在 EAS 侧登录 Apple ID + 输入 App-specific password（EAS CLI 交互，无法自动化）

## Notes
- Cairn 已用 EAS Build，参考 Cairn `docs/EAS_BUILD_GUIDE.md`
- 首次 build 需要 Apple 生成 Provisioning Profile + Distribution Certificate（EAS 可代管）
- 用户需要在 App Store Connect 手动创建 App with Bundle ID `com.yiiling.k0`（第一次 SPIKE-006 前手动做）

### 2026-07-05 Sprint 2 Planning 追加 — Credential-Dependent 标记
- 用户 2026-07-05 planning 时在睡眠中，无法交互提供 Apple credentials
- SM 处理流程：
  1. DevOps 先落地 `eas.json`（三 profile 配置），本地生成 preview/production config 结构
  2. `docs/spike-results/SPIKE-006.md` 骨架先建（含"待 user credentials 后填充"占位段）
  3. `eas login` / `eas build` 需要 credentials 时 fail → 记录到 `tasks/errors.md`，Status 保持 Todo，不 block Sprint 2 其他 Story Done
  4. 用户回来后 ≈ 10 分钟交互完成余下步骤
- **明确**：SPIKE-006 blocked 不影响 Sprint 2 Definition of Done（Sprint Goal 里 SPIKE-006 是 "attempted"，credential-dependent 部分 defer）
