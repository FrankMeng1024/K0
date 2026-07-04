import { StubScreen } from '@/components/StubScreen';
import { colors } from '@/constants/theme';

export default function Library() {
  return (
    <StubScreen
      testIdBase="library"
      title="Library"
      subtitle="你已经收集的知识"
      tag="0 cards"
      accentColor={colors.sapphire}
      bodyLead="Sprint 4 会在这里让你："
      bodyDetails={[
        '按主题、来源、类型筛选卡片',
        '跨集搜索：一个关键词，从所有笔记里找线索',
        '收藏 & 编辑「我的应用」',
      ]}
    />
  );
}
