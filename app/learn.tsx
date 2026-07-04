import { StubScreen } from '@/components/StubScreen';
import { colors } from '@/constants/theme';

export default function Learn() {
  return (
    <StubScreen
      testIdBase="learn"
      title="Learn"
      subtitle="把一段音频变成一节课"
      tag="today · empty"
      accentColor={colors.brick}
      bodyLead="Sprint 2 会在这里让你："
      bodyDetails={[
        '粘贴一条 YouTube / Apple Podcasts 链接',
        '看到系统抓取转录 + 生成学习包的进度',
        '拿到一句话总结 + 6 步学习路径 + 5-10 张卡片',
      ]}
    />
  );
}
