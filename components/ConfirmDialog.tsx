// K0 ConfirmDialog — Sprint 13 R1 rebuilt
// 撕纸手工风自定义确认弹窗（替代 native Alert.alert）
// 所有 double confirm 使用此组件
import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { WovenDivider } from '@/components/WovenDivider';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Sprint 13 R1: 撕纸风顶部纹理换成 WovenDivider（正统撕纸边） */}
          <View style={styles.tornEdgeContainer}>
            <WovenDivider width={280} height={10} />
          </View>
          <View style={styles.body}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnCancel]} onPress={onCancel}>
                <Text style={styles.btnCancelText}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, destructive ? styles.btnDestructive : styles.btnConfirm]}
                onPress={onConfirm}
              >
                <Text style={destructive ? styles.btnDestructiveText : styles.btnConfirmText}>
                  {confirmLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 22, 19, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    overflow: 'hidden',
    // Sprint 13 R2: 手工感阴影零偏移（对齐 UI_SPEC §chosen-style）
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  tornEdgeContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  body: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.hero,
    fontSize: 22,
    lineHeight: 26,
    color: colors.inkPrimary,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnCancel: {
    backgroundColor: colors.paperMain,
    borderColor: colors.paperDark,
  },
  btnCancelText: {
    fontFamily: fonts.ui,
    fontSize: 15,
    color: colors.inkPrimary,
  },
  btnConfirm: {
    backgroundColor: colors.sapphire,
    borderColor: colors.sapphire,
  },
  btnConfirmText: {
    fontFamily: fonts.ui,
    fontSize: 15,
    color: colors.paperCream,
  },
  btnDestructive: {
    backgroundColor: colors.brick,
    borderColor: colors.brick,
  },
  btnDestructiveText: {
    fontFamily: fonts.ui,
    fontSize: 15,
    color: colors.paperCream,
    fontWeight: '600',
  },
});
