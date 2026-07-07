// Bubble tag — white oval with dot prefix + italic handwritten body
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '@/constants/theme';

export function BubbleTag({ children, dotColor = colors.brick, testID }: { children: string; dotColor?: string; testID?: string }) {
  return (
    <View style={styles.bubble} testID={testID}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.label}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    // Sprint 13 #5: white → paperCream 融入 kraft 背景，避免"右上白点"突兀
    backgroundColor: colors.paperCream,
    borderRadius: radii.bubble,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.inkPrimary,
  },
});
