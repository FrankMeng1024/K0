// Sprint 14 R3 — DebugUploadZone
// 首页 3-tap version popup 内的调试图片上传（1-5 张）
// 依赖 expo-image-picker（本次未装，Frank 需 `npx expo install expo-image-picker` + EAS build）
// Sprint 15：动态 require expo-image-picker，未装时显示提示，避免 bundle 崩
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';

// 动态 require——package.json 未装 expo-image-picker 时不会阻断 bundle
let ImagePicker: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch {
  ImagePicker = null;
}

// R36 图片上传修复: 弃 fetch(uri).blob()(RN 读本地 URI 常返回空 body → 后端 400)。
// 改用 expo-file-system/legacy 的 uploadAsync(BINARY_CONTENT) 流式发本地文件, 契合后端 raw 端点。
let FileSystemLegacy: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  FileSystemLegacy = require('expo-file-system/legacy');
} catch {
  FileSystemLegacy = null;
}

import { colors, spacing, radii, typography, borderWidth } from '@/constants/theme';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3002';
const MAX_IMAGES = 5;

type UploadResult = {
  view_url: string;
  bytes: number;
  ok: boolean;
  error?: string;
};

function genId() {
  // 简单 uuid v4-ish（RN 没有原生 crypto.randomUUID）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function guessMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

export function DebugUploadZone() {
  const [selected, setSelected] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [results, setResults] = useState<UploadResult[]>([]);

  const pick = useCallback(async () => {
    // Sprint 15: expo-image-picker 未装时静默返回
    if (!ImagePicker) return;
    // 权限
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('无相册权限', '请到系统设置里给 K0 开启相册权限。');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      // Sprint 14 R2 build fix: MediaTypeOptions deprecated in SDK 51+，改用字符串数组
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES,
      quality: 0.8,
    });
    if (res.canceled) return;
    const assets = res.assets || [];
    setSelected(assets.slice(0, MAX_IMAGES));
    setResults([]);
  }, []);

  const clear = useCallback(() => {
    setSelected([]);
    setResults([]);
    setProgress({ done: 0, total: 0 });
  }, []);

  const upload = useCallback(async () => {
    if (selected.length === 0 || uploading) return;
    setUploading(true);
    setProgress({ done: 0, total: selected.length });
    setResults([]);

    const batchId = genId();
    let doneCount = 0;

    const tasks = selected.map(async (asset): Promise<UploadResult> => {
      try {
        const mime = guessMime(asset.uri);
        const uploadId = genId();
        const metaObj = {
          app_version: process.env.EXPO_PUBLIC_APP_VERSION || 'dev',
          width: asset.width,
          height: asset.height,
          filename: asset.fileName || null,
          mime,
          picked_at: new Date().toISOString(),
        };
        // base64 编码 meta（RN 环境用 btoa 需要 polyfill；用 Buffer 替代不可用，走 encodeURIComponent 也行）
        // 简单起见：JSON 转 UTF-8 bytes → base64
        let metaB64 = '';
        try {
          const jsonStr = JSON.stringify(metaObj);
          // RN 全局 btoa 只支持 latin1；先 encodeURIComponent + unescape
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const g: any = globalThis as any;
          if (typeof g.btoa === 'function') {
            metaB64 = g.btoa(unescape(encodeURIComponent(jsonStr)));
          }
        } catch {
          metaB64 = '';
        }

        const qs = new URLSearchParams({
          id: uploadId,
          batch: batchId,
          meta: metaB64,
        }).toString();
        const url = `${API_BASE}/api/debug/upload?${qs}`;

        // R36: expo-file-system uploadAsync — 流式发本地文件, 不经 blob。
        // BINARY_CONTENT = 把文件字节作为 raw body(匹配后端 express.raw)。
        if (!FileSystemLegacy?.uploadAsync) {
          return { view_url: '', bytes: 0, ok: false, error: 'expo-file-system 不可用(需下次 build)' };
        }
        const resp = await FileSystemLegacy.uploadAsync(url, asset.uri, {
          httpMethod: 'POST',
          uploadType: FileSystemLegacy.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': mime },
        });
        doneCount += 1;
        setProgress({ done: doneCount, total: selected.length });

        // uploadAsync 返回 { status, body, headers } —— body 是字符串, 需自己 parse
        const status: number = resp?.status ?? 0;
        const bodyText: string = resp?.body ?? '';
        if (status < 200 || status >= 300) {
          return { view_url: '', bytes: 0, ok: false, error: `HTTP ${status}: ${bodyText.slice(0, 120)}` };
        }
        let json: any = {};
        try {
          json = JSON.parse(bodyText);
        } catch {
          return { view_url: '', bytes: 0, ok: false, error: `响应非 JSON: ${bodyText.slice(0, 80)}` };
        }
        const full = json.view_url && String(json.view_url).startsWith('http')
          ? json.view_url
          : `${API_BASE}${json.view_url}`;
        return { view_url: full, bytes: json.bytes || 0, ok: true };
      } catch (e: unknown) {
        doneCount += 1;
        setProgress({ done: doneCount, total: selected.length });
        const msg = e instanceof Error ? e.message : String(e);
        return { view_url: '', bytes: 0, ok: false, error: msg };
      }
    });

    const out = await Promise.all(tasks);
    setResults(out);
    setUploading(false);
  }, [selected, uploading]);

  const hasResults = results.length > 0;
  const canUpload = selected.length > 0 && !uploading;

  // Sprint 15: expo-image-picker 未装（当前 OTA v24 场景），展示占位
  if (!ImagePicker) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hintText}>图片上传需要下次 EAS build 生效</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>调试上传（最多 5 张）</Text>

      <View style={styles.thumbRow}>
        {Array.from({ length: MAX_IMAGES }).map((_, i) => {
          const asset = selected[i];
          return (
            <View key={i} style={styles.thumbCell}>
              {asset ? (
                <Image source={{ uri: asset.uri }} style={styles.thumbImg} resizeMode="cover" />
              ) : (
                <Text style={styles.thumbPlaceholder}>{i + 1}</Text>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.btnRow}>
        <Pressable
          style={[styles.btn, styles.btnSecondary]}
          onPress={pick}
          disabled={uploading}
        >
          <Text style={styles.btnTextSecondary}>
            {selected.length > 0 ? `已选 ${selected.length}/${MAX_IMAGES} · 重选` : '选图'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary, !canUpload && styles.btnDisabled]}
          onPress={upload}
          disabled={!canUpload}
        >
          {uploading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.paperCream} />
              <Text style={[styles.btnTextPrimary, { marginLeft: 6 }]}>
                {progress.done}/{progress.total}
              </Text>
            </View>
          ) : (
            <Text style={styles.btnTextPrimary}>上传</Text>
          )}
        </Pressable>
        {(selected.length > 0 || hasResults) && !uploading && (
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={clear}>
            <Text style={styles.btnTextGhost}>清空</Text>
          </Pressable>
        )}
      </View>

      {hasResults && (
        <View style={styles.resultBlock}>
          <Text style={styles.resultTitle}>上传结果</Text>
          {results.map((r, i) => (
            <Pressable
              key={i}
              disabled={!r.ok}
              onPress={() => r.ok && r.view_url && Linking.openURL(r.view_url)}
            >
              <Text
                style={[styles.resultRow, r.ok ? styles.resultOk : styles.resultFail]}
                numberOfLines={1}
              >
                {r.ok ? `#${i + 1} · ${(r.bytes / 1024).toFixed(1)}KB · ${r.view_url}` : `#${i + 1} · 失败: ${r.error || '未知'}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sprint 15: 未装 image-picker 时的占位文字
  hintText: {
    fontSize: 12,
    color: colors.inkSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  wrap: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.paperCream,
    borderWidth: borderWidth.thin,
    borderColor: colors.inkPrimary,
  },
  sectionTitle: {
    fontSize: typography.bodySmall,
    color: colors.inkPrimary,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  thumbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  thumbCell: {
    width: 48,
    height: 48,
    borderRadius: radii.card,
    backgroundColor: colors.paperDark,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    fontSize: typography.ui,
    color: colors.inkSecondary,
    opacity: 0.5,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  btn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.card,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.brick,
  },
  btnSecondary: {
    backgroundColor: colors.paperDark,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: borderWidth.thin,
    borderColor: colors.inkSecondary,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnTextPrimary: {
    color: colors.paperCream,
    fontSize: typography.bodySmall,
    fontWeight: '600',
  },
  btnTextSecondary: {
    color: colors.inkPrimary,
    fontSize: typography.bodySmall,
    fontWeight: '500',
  },
  btnTextGhost: {
    color: colors.inkSecondary,
    fontSize: typography.bodySmall,
  },
  resultBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: borderWidth.thin,
    borderTopColor: colors.paperDark,
  },
  resultTitle: {
    fontSize: typography.ui,
    color: colors.inkSecondary,
    marginBottom: spacing.xs,
  },
  resultRow: {
    fontSize: typography.ui,
    marginBottom: spacing.xs,
  },
  resultOk: {
    color: colors.sapphire,
    textDecorationLine: 'underline',
  },
  resultFail: {
    color: colors.brick,
  },
});

export default DebugUploadZone;
