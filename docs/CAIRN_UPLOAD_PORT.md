# Cairn 图片上传抄袭报告

## Cairn 原实现分析

**核心发现**：Cairn 项目**从未实现真正的用户图片上传**。
- `app/package.json` 装了 `expo-image-picker@17.0.11` + `expo-image-manipulator@14.0.8`，但代码库里**没有任何 `ImagePicker.*` 调用**（grep 整个 `/opt/githubRepos/Cairn` 只在 package.json/lockfile 命中）
- `docs/photography_strategy.md` 明写 v1 不做用户上传：*"Stage 1 — User-attached photos (probably v1.1)"*
- 数据模型仅保留了 `heroPhotoUrl` / `photoUrls[]` 字段，实际后端表未建

Cairn 里**真正实现**的最接近产品级图片上传的是 **AR debug snapshot**：

| 项 | Cairn 实现 |
|---|---|
| 前端组件 | `app/src/components/ViroARRitualOverlay.tsx` — `takeDebugSnapshot()` 通过 Viro ARSceneNavigator 截屏，`fetch(file://…)` 转 blob 后 POST |
| 后端 endpoint | `POST /api/debug-snapshot` — `express.raw({ type: 'image/png', limit: '12mb' })` |
| 传输方式 | **raw body 二进制** —— 无 multer、无 multipart、无 base64 |
| 存储 | MySQL LONGBLOB（migration `011_debug_snapshots.sql`） |
| 图片压缩 | **无** —— 客户端不压缩，服务端直存 |
| EXIF 剥除 | **无** |
| 缩略图变体 | **无** —— 仅存原图 |
| 鉴权 | **无** —— 只有 `express-rate-limit` 60/5min/IP |
| Magic bytes 校验 | PNG magic 89504E47 |
| meta 传递 | query string `?meta=<base64-json>` |
| 后端 dep | 仅 `express` + `express-rate-limit` + `mysql2` |

**backend 依赖清单**（Cairn `backend/package.json`）：**无 multer / multipart / form-data**。整个后端图片处理只用了 Express 内置 `express.raw()`。

## K0 现状（在 Frank 授权下已存在的 Cairn 模式移植）

K0 之前的 subagent 已经完全按 Cairn debug-snapshot 架构做过：
- `components/DebugUploadZone.tsx` — 相册选图 + 上传（5 张上限）
- `backend/src/routes/debugUpload.js` — `express.raw()` + LONGBLOB
- `backend/migrations/008_debug_uploads.sql` — 表结构

这套 K0 debug 版本**架构与 Cairn 一致**（因为 Cairn 只有这一套图片相关代码），Frank 说的"抄 Cairn"实际上就是抄 debug-snapshot。

## Sprint 15 交付：产品级独立版本

按 Frank 的"不只是 debug，是产品级"要求，**保留 debug 版本不动**，新建独立产品级版本：

### 已新建

1. **`components/ImageUploader.tsx`**（334 行）
   - 复用 `DebugUploadZone` 的核心 fetch → blob → POST 流程
   - **区别**：
     - 端点 `/api/uploads`（非 `/api/debug/upload`）
     - `maxImages` 可配置（默认 3，Debug 版固定 5）
     - 支持 `image/heic`（iOS 相册默认，Debug 版仅 PNG/JPEG）
     - `onUploaded(images)` callback 交付 view_url 给宿主组件
     - `hideResultList` 允许宿主组件自渲染结果 UI
     - UI 用 K0 撕纸拼布风：`brick`（上传按钮）+ `yolk`（选图按钮）+ `olive`（边框/成功文字）+ `paperCream`（底）
   - 动态 `require('expo-image-picker')`，未装依赖时不阻断 metro bundle

2. **`backend/src/routes/uploads.js`**（约 210 行）
   - **架构**：Express 5 `router.post('/', ratelimit, express.raw({type: [png|jpeg|heic|heif], limit: '15mb'}))`
   - **magic bytes**：PNG（89 50 4E 47）+ JPEG（FF D8）+ HEIC/HEIF（`ftyp` box + brand `heic/heix/mif1/msf1`）
   - **速率**：60/5min/IP（比 debug 通道的 30/5min 宽松）
   - **上限**：15 MB（比 debug 12 MB 略宽以容纳 iOS HEIC 原图）
   - **路由**：
     - `POST /api/uploads?id=&batch=&meta=<b64>` → 存 blob，返回 `{ok, id, batch_id, bytes, format, width, height, view_url}`
     - `GET /api/uploads/mine` → 当前 user 最近 50 条元数据（软删过滤）
     - `GET /api/uploads/batch/:batch_id` → 同 batch 元数据
     - `GET /api/uploads/:upload_id` → 图片二进制（`Cache-Control: public, max-age=3600`）
     - `DELETE /api/uploads/:upload_id` → 软删（仅本人，`deleted_at` 打时间戳）

3. **`backend/migrations/009_user_uploads.sql`**
   - 独立于 `debug_uploads`
   - 多加：`width` / `height` / `deleted_at` 三列 + `idx_user_id` 索引
   - LONGBLOB 存二进制 + JSON meta

4. **`backend/src/index.js`**（+2 行）
   - `import uploadsRouter from './routes/uploads.js';`
   - `app.use('/api/uploads', uploadsRouter);`

## 依赖清单

**前端**（`package.json` 已有 `expo-image-picker` 声明但未 install）：
```
npx expo install expo-image-picker
```

无需 `expo-image-manipulator`（Cairn 也没实际用、K0 目前也不压缩）。
无需 `expo-file-system`（走 `fetch(file://)` → `blob()`，与 Cairn 一致）。

**后端**：**零新增依赖**。`express` / `express-rate-limit` / `mysql2` / `crypto` 已在 `backend/package.json`。

## 集成位置

- **`components/DebugUploadZone.tsx`** —— 保留在 3-tap 版本 popup 里作为 debug 通道（端点 `/api/debug/upload`）
- **`components/ImageUploader.tsx`** —— 新组件，未挂载到具体页面，等宿主页面（用户反馈表单 / 学习卡片附图 / 未来标记附图）按需 import：
  ```tsx
  import { ImageUploader } from '@/components/ImageUploader';
  <ImageUploader maxImages={3} onUploaded={(imgs) => setPhotos(imgs)} title="添加学习截图" />
  ```

按 Frank"抄好就好"没明确说触发位置，我按 Cairn 的做法：**只交付独立组件，不硬塞进现有页面**，等下一次需求（例如"评论/反馈附图"或"标记附图"）再引入。

## Frank 需要做的

1. **前端依赖**（若之前 EAS build 未装）：
   ```bash
   cd C:/ClaudeCodeProjects/K0
   npx expo install expo-image-picker
   ```
2. **服务器部署**：
   ```bash
   scp backend/src/routes/uploads.js root@122.51.174.118:/opt/K0/backend/src/routes/
   scp backend/src/index.js root@122.51.174.118:/opt/K0/backend/src/
   scp backend/migrations/009_user_uploads.sql root@122.51.174.118:/opt/K0/backend/migrations/
   ssh root@122.51.174.118 'mysql k0 < /opt/K0/backend/migrations/009_user_uploads.sql'
   ssh root@122.51.174.118 'systemctl restart k0-backend'   # 或 pm2 restart
   ```
3. **前端不需要 OTA**：`ImageUploader` 未挂载到任何页面，metro bundle 不会加载（可选：以后 OTA 推出真正的宿主页面时再引入）

## 差异说明

| 项 | Cairn 原实现 | K0 debug 版 | K0 产品版（本次） |
|---|---|---|---|
| 端点 | `/api/debug-snapshot` | `/api/debug/upload` | `/api/uploads` |
| 上限 | 12 MB | 12 MB | 15 MB |
| 格式 | PNG only | PNG/JPEG | PNG/JPEG/HEIC/HEIF |
| Rate limit | 60/5min | 30/5min | 60/5min |
| 表 | `debug_snapshots` | `debug_uploads` | `user_uploads` |
| 软删 | 无 | 无 | `deleted_at` 列 |
| callback | 无 | 无 | `onUploaded(images)` |
| user_id | 无 | 有列但可空 | 有列 + `/mine` 端点按 user 过滤 |

**为什么加 HEIC**：Cairn 只处理自家 AR PNG 截图，K0 产品级需要接 iOS 用户相册（默认 HEIC）。magic bytes 校验 `ftyp` box + brand，无需服务端转码——iOS 前端 `<Image source={{uri}}>` 原生支持 HEIC。

**为什么加软删**：Cairn debug-snapshot 是运维数据（Frank 单向查看），产品版用户会想删自己上传的图，`deleted_at` 是最小成本的隐私实现。
