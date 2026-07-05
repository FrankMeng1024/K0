import { StubScreen } from '@/components/StubScreen';
import { colors } from '@/constants/theme';

export default function Review() {
  return (
    <StubScreen
      testIdBase="review"
      title="Review"
      subtitle="收藏卡片的复习节奏"
      tag="即将上线"
      accentColor={colors.yolk}
      bodyLead="即将上线 — 你将能够："
      bodyDetails={[
        '看到今天应该复习的卡片（明天/三天/一周节奏）',
        '一次一张，正面 → 翻面 → 记得/不记得',
        '不催、不评分，只是陪你走完',
      ]}
    />
  );
}
