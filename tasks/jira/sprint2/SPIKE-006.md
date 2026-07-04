# SPIKE-006: Expo EAS Build 从 Windows 出 iOS TestFlight 包

**Epic**: E-007 Foundation（新增，因 CR-001）
**Sprint**: Sprint 1
**Points**: 3
**Owner**: DevOps + Frontend
**Status**: Todo

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
- Apple Developer 账号（用户确认 Cairn 用同账号 → 有）
- Bundle ID `com.yiiling.k0`（需要在 App Store Connect 建 App）

## Notes
- Cairn 已用 EAS Build，参考 Cairn `docs/EAS_BUILD_GUIDE.md`
- 首次 build 需要 Apple 生成 Provisioning Profile + Distribution Certificate（EAS 可代管）
- 用户需要在 App Store Connect 手动创建 App with Bundle ID `com.yiiling.k0`（第一次 SPIKE-006 前手动做）
