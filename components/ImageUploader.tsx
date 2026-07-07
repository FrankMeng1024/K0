// Sprint 15: 产品级图片上传组件（照抄 Cairn debug-snapshot 架构，独立于 DebugUploadZone）
// 主要区别 vs DebugUploadZone：
//   1. 打到 /api/uploads 而非 /api/debug/upload
//   2. UI 使用 K0 撕纸拼布风（brick/yolk/olive/paperCream）
//   3. 通过 onUploaded callback 把 view_url 交给宿主组件
//   4. 可配置 maxImages（默认 3，Debug 版固定 5）
//   5. 支持 HEIC（iOS 相册默认格式）
//
// 动态 require expo-image-picker——未装依赖时不阻断 metro bundle。
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';

// 动态 require——package.json 未装 expo-image-picker 时不阻断 bundle
let ImagePicker: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch {
  ImagePicker = null;
}

import { colors, spacing, radii, typography, borderWidth } from '@/constants/theme';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3002';

export type UploadedImage = {
  upload_id: string;
  view_url: string; // 绝对 URL
  bytes: number;
  format: string;
  width?: number;
  height?: number;
};

type UploadResult = UploadedImage & { ok: boolean; error?: string };

type Props = {
  maxImages?: number; // 默认 3
  onUploaded?: (images: UploadedImage[]) => void;
  title?: string;
  hideResultList?: boolean; // 宿主组件自己渲染结果时隐藏内置结果 UI
};

function genId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function uriToBlob(uri: string): Promise<Blob> {
  const r = await fetch(uri);
  return await r.blob();
}

function guessMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

export function ImageUploader({
  maxImages = 3,
  onUploaded,
  title = '添加图片',
  hideResultList = false,
}: Props) {
  const [selected, setSelected] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [results, setResults] = useState<UploadResult[]>([]);

  const pick = useCallback(async () => {
    if (!ImagePicker) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('需要相册权限', '请到系统设置里给 K0 打开相册权限。');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: maxImages,
      quality: 0.85,
    });
    if (res.canceled) return;
    const assets = res.assets || [];
    setSelected(assets.slice(0, maxImages));
    setResults([]);
  }, [maxImages]);

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
        const blob = await uriToBlob(asset.uri);
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
        let metaB64 = '';
        try {
          const jsonStr = JSON.stringify(metaObj);
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
        const url = `${API_BASE}/api/uploads?${qs}`;

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': mime },
          body: blob,
        });
        doneCount += 1;
        setProgress({ done: doneCount, total: selected.length });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          return {
            upload_id: uploadId,
            view_url: '',
            bytes: 0,
            format: mime.replace('image/', ''),
            ok: false,
            error: `HTTP ${resp.status}: ${text.slice(0, 120)}`,
          };
        }
        const json = await resp.json();
        const full = json.view_url && String(json.view_url).startsWith('http')
          ? json.view_url
          : `${API_BASE}${json.view_url}`;
        return {
          upload_id: json.id || uploadId,
          view_url: full,
          bytes: json.bytes || 0,
          format: json.format || mime.replace('image/', ''),
          width: json.width,
          height: json.height,
          ok: true,
        };
      } catch (e: unknown) {
        doneCount += 1;
        setProgress({ done: doneCount, total: selected.length });
        const msg = e instanceof Error ? e.message : String(e);
        return {
          upload_id: '',
          view_url: '',
          bytes: 0,
          format: '',
          ok: false,
          error: msg,
        };
      }
    });

    const out = await Promise.all(tasks);
    setResults(out);
    setUploading(false);
    if (onUploaded) {
      onUploaded(out.filter((r) => r.ok));
    }
  }, [selected, uploading, onUploaded]);

  const hasResults = results.length > 0;
  const canUpload = selected.length > 0 && !uploading;

  if (!ImagePicker) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hintText}>图片上传需要下次 EAS build 生效</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>{title}（最多 {maxImages} 张）</Text>

      <View style={styles.thumbRow}>
        {Array.from({ length: maxImages }).map((_, i) => {
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
            {selected.length > 0 ? `已选 ${selected.length}/${maxImages} · 重选` : '选图'}
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

      {!hideResultList && hasResults && (
        <View style={styles.resultBlock}>
          <Text style={styles.resultTitle}>上传结果</Text>
          {results.map((r, i) => (
            <Text
              key={i}
              style={[styles.resultRow, r.ok ? styles.resultOk : styles.resultFail]}
              numberOfLines={1}
            >
              {r.ok
                ? `#${i + 1} · ${(r.bytes / 1024).toFixed(1)}KB · ${r.format}`
                : `#${i + 1} · 失败: ${r.error || '未知'}`}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hintText: {
    fontSize: typography.bodySmall,
    color: colors.inkSecondary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
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
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  thumbCell: {
    width: 56,
    height: 56,
    borderRadius: radii.card,
    backgroundColor: colors.paperDark,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: borderWidth.thin,
    borderColor: colors.olive,
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
    backgroundColor: colors.yolk,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: borderWidth.thin,
    borderColor: colors.olive,
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
    fontWeight: '600',
  },
  btnTextGhost: {
    color: colors.olive,
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
    color: colors.olive,
  },
  resultFail: {
    color: colors.brick,
  },
});

export default ImageUploader;
