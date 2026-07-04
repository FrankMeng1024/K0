import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';

type Props = {
  title: string;
  subtitle: string;
  tag: string;
  accentColor: string;
  bodyLead: string;
  bodyDetails: string[];
  testIdBase: string;
};

export function StubScreen({ title, subtitle, tag, accentColor, bodyLead, bodyDetails, testIdBase }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl },
      ]}
      testID={`${testIdBase}-scroll`}
    >
      <View
        // @ts-ignore
        dataSet={{ testid: `${testIdBase}-root` }}
        style={styles.container}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            // @ts-ignore
            dataSet={{ testid: `${testIdBase}-back` }}
            accessibilityRole="button"
            accessibilityLabel="返回"
            style={styles.backBtn}
          >
            <Text style={styles.backText}>← Home</Text>
          </Pressable>
          <BubbleTag dotColor={accentColor} testID={`${testIdBase}-tag`}>{tag}</BubbleTag>
        </View>

        <Text
          style={[styles.title, { color: accentColor }]}
          // @ts-ignore
          dataSet={{ testid: `${testIdBase}-title` }}
          accessibilityRole="header"
        >
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.dividerWrap}>
          <WovenDivider width={280} height={10} />
        </View>

        <Text style={styles.leadPara}>{bodyLead}</Text>

        <View style={styles.detailsBlock}>
          {bodyDetails.map((d, i) => (
            <View key={i} style={styles.detailRow}>
              <View style={[styles.detailDot, { backgroundColor: accentColor }]} />
              <Text style={styles.detailText}>{d}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.foot} testID={`${testIdBase}-foot`}>Sprint 2 会填这里的功能。</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  content: { flexGrow: 1 },
  container: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { paddingVertical: spacing.sm, paddingRight: spacing.md, minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary },
  title: { fontFamily: fonts.hero, fontSize: 56, lineHeight: 60, marginTop: spacing.sm },
  subtitle: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 15, color: colors.inkSecondary },
  dividerWrap: { alignItems: 'center', marginVertical: spacing.md },
  leadPara: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.inkPrimary },
  detailsBlock: { gap: spacing.sm, marginTop: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  detailDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  detailText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.inkSecondary },
  foot: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 13, color: colors.inkSecondary, alignSelf: 'center', marginTop: spacing.xl },
});
