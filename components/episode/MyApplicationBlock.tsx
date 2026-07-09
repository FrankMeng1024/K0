// MyApplicationBlock — 卡片「我的应用」编辑块 (AI 建议 + 用户编辑, 乐观保存)
// 原 episode 内联, Phase F 抽出。
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';

export function MyApplicationBlock({
  packId, cardIdx, myApplication, personalNote, onSave,
}: {
  packId: number; cardIdx: number; myApplication: string; personalNote: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(personalNote || '');
  const displayText = personalNote || myApplication;
  const label = personalNote ? '我的应用（已编辑）' : '我的应用';

  const save = async () => {
    const trimmed = text.trim();
    onSave(trimmed);
    setEditing(false);
    try {
      await apiFetch(`/api/packs/${packId}/cards/${cardIdx}`, {
        method: 'PATCH',
        body: JSON.stringify({ personalNote: trimmed }),
      });
    } catch {
      // silent fail; UI 已乐观更新
    }
  };

  if (editing) {
    return (
      <View style={styles.myAppBlock}>
        <Text style={styles.myAppLabel}>{label}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          style={styles.myAppInput}
          placeholder="写下这张卡片对你的意义…"
          onBlur={save}
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <Pressable onPress={save} style={styles.myAppBtn}>
            <Text style={styles.myAppBtnText}>保存</Text>
          </Pressable>
          <Pressable onPress={() => { setText(personalNote || ''); setEditing(false); }} style={styles.myAppBtnSecondary}>
            <Text style={styles.myAppBtnSecondaryText}>取消</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <Pressable onPress={() => setEditing(true)} style={styles.myAppBlock} accessibilityLabel="编辑我的应用">
      <Text style={styles.myAppLabel}>{label}</Text>
      <Text style={styles.myAppText}>{displayText || '点击写下这张卡片对你的意义…'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  myAppBlock: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.paperMain, borderRadius: 8 },
  myAppLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3, marginBottom: 4 },
  myAppText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19 },
  myAppInput: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19, minHeight: 60, borderRadius: 6, padding: spacing.xs, backgroundColor: colors.paperCream },
  myAppBtn: { backgroundColor: colors.brick, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 6 },
  myAppBtnText: { color: colors.paperCream, fontFamily: fonts.ui, fontSize: 12 },
  myAppBtnSecondary: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.paperCream },
  myAppBtnSecondaryText: { color: colors.inkSecondary, fontFamily: fonts.ui, fontSize: 12 },
});
