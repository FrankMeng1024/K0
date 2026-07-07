# Sprint 14 R3 — 首页 debug 图片上传部署清单

## 变更概述
首页 3-tap version popup 内新增图片上传能力（1-5 张，无鉴权，仅 IP 速率限制）。
参考 Cairn `debug-snapshot` 设计：raw body + LONGBLOB。

## 新增/修改文件

### Backend
- `backend/migrations/008_debug_uploads.sql`（新增，008 因 007 已被 pack_access_mode 占用）
- `backend/src/routes/debugUpload.js`（新增）
- `backend/src/index.js`（+2 行 import/use）

### Frontend
- `app.json`（新增 iOS `NSPhotoLibraryUsageDescription` + Android `READ_MEDIA_IMAGES` + `expo-image-picker` plugin）
- `components/DebugUploadZone.tsx`（新增）
- `app/index.tsx`（version popup 内挂载 `<DebugUploadZone />`）

## 部署步骤

### 1. Backend 上传
```bash
scp backend/migrations/008_debug_uploads.sql root@122.51.174.118:/var/www/k0-api/migrations/
scp backend/src/routes/debugUpload.js root@122.51.174.118:/var/www/k0-api/src/routes/
scp backend/src/index.js root@122.51.174.118:/var/www/k0-api/src/
```

### 2. 执行 migration
K0 现有 migration 是纯 SQL，直接用 mysql 客户端跑：
```bash
ssh root@122.51.174.118 'mysql -u k0_user -p"K0_Prod_2026_qxfkpjeu" k0 < /var/www/k0-api/migrations/008_debug_uploads.sql'
```

### 3. 重启后端
```bash
ssh root@122.51.174.118 'systemctl restart k0-api'
```
（本地 3002 若挂 nodemon 会自动 reload，无需重启）

### 4. 生产验证
```bash
# 造一张小 JPEG 测试
curl -X POST -H "Content-Type: image/jpeg" --data-binary @test.jpg \
  "https://api.k0.yiiling.cn/api/debug/upload?id=$(uuidgen)&batch=$(uuidgen)&meta="

# 拉最近 20 条
curl "https://api.k0.yiiling.cn/api/debug/upload/latest"

# 看某张图（浏览器直接开）
https://api.k0.yiiling.cn/api/debug/upload/<upload_id>
```

## 前端 EAS build（Frank 授权后）

**⚠️ 必须 build，不能 OTA**——因 app.json 加了 iOS `NSPhotoLibraryUsageDescription` + Android permission + `expo-image-picker` plugin，这些是 native config，OTA 不生效。

```bash
# 装依赖（Claude 未执行，留给 Frank）
npx expo install expo-image-picker

# build
npx eas build --platform ios --profile production
# 或 all
npx eas build --platform all --profile production
```

build 前请确认 `package.json` 里有 `expo-image-picker`；无则先 `npx expo install expo-image-picker`。

## API 契约（简）
- `POST /api/debug/upload?id=<upload_id>&batch=<batch_id>&meta=<b64-json>`
  - Content-Type: `image/png` 或 `image/jpeg`
  - Body: raw binary，最大 12MB
  - magic byte 校验（PNG `89 50 4E 47` / JPEG `FF D8`）
  - 速率限制：30 次 / 5 分钟 / IP
  - 返回：`{ ok, id, batch_id, bytes, format, view_url }`
- `GET /api/debug/upload/latest` → `{ items: [ { id, upload_id, batch_id, bytes, format, meta, app_version, uploaded_at, view_url } ] }`（最近 20，无 blob）
- `GET /api/debug/upload/batch/:batch_id` → 同一批的元数据
- `GET /api/debug/upload/:upload_id` → 图片二进制（Content-Type 自动带 `image/png|jpeg`）
