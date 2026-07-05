# GLM 横评盲评材料 v2

**播客**：硬地骇客 EP127 - 从 Skills 到自动化工作流，论 Agent 如何接管真实生产力
**时长**：51 分钟
**转录**：BCUT ASR (1431 segments, 38176 chars)

## 场景
用户 Frank 想要**最高质量学习包**，个人向使用（1-2 人，不考虑高日活），预算充足。以下 6 个学习包由不同 AI 模型基于同一 transcript 生成。

## 评分维度（每项 1-10 分）
1. **主题准确度**（oneSentence 是否抓住真正核心，非泛泛而谈）
2. **核心点精准度**（corePoints 具体 + 有记忆点 + 准确）
3. **学习路径深度**（steps 逻辑连贯 + 覆盖主要内容）
4. **卡片可复用性**（cards 是否点出可复用的方法/观点/反思）
5. **行动实用性**（actions 是否具体可执行）
6. **中文表达质量**（无翻译腔、无生硬）
7. **timestamp 准确度**（是否真实指向 transcript 里的时刻）

## 特别关注
- **错别字造成的语义歧义**：可扣分
- **纯错别字（不改变语义）**：不扣分
- **跳过重要内容**：严重扣分
- **数量不重要，质量重要**

## 输出

针对每个学习包 A-F，输出：
```
学习包 X:
  维度 1: N分 - 简短理由
  维度 2: N分 - 简短理由
  ...
  总分: N.N 分（7 维度平均）
  一句话评价: ...
```

最后给出排名：`X > Y > Z > ...`

---


═══════════════════════════════
## 学习包 A
═══════════════════════════════

```json
{
  "oneSentence": "Skills应解决重复工作或弥补能力缺失，真正自动化依赖闭环验证。",
  "corePoints": [
    {
      "point": "判断Skill价值标准：解决重复工作或弥补短板",
      "timestamp": 249
    },
    {
      "point": "Coding中最有用Skill是能实现真实验证闭环的",
      "timestamp": 665
    },
    {
      "point": "从要求AI自审到完全信任，是必然的心理转变",
      "timestamp": 2336
    }
  ],
  "audience": [
    "开发者",
    "AI效率工具用户",
    "独立开发者"
  ],
  "valueScore": {
    "density": 8,
    "novelty": 7,
    "actionability": 9
  },
  "estimatedCostMinutes": 8,
  "steps": [
    {
      "title": "筛选标准：按需而非跟风",
      "content": "在初始化工程时利用 `find skills` 只安装必要的技术栈插件，避免盲目跟风。判断Skill是否值得安装的核心标准是看它是否真正解决了日常重复性工作，或者是否弥补了你在不擅长领域的知识缺失。",
      "sourceTimestamp": 82
    },
    {
      "title": "技术栈：与AI讨论决定",
      "content": "有了Idea后先与AI讨论技术栈方向，让AI结合你的经验推荐可能超出传统范畴的方案。不要被过去的经验束缚，敢于尝试AI推荐的新技术组合，让Agent帮你完成架构初始化。",
      "sourceTimestamp": 1095
    },
    {
      "title": "架构：先画地图再编码",
      "content": "在写具体功能前，让Agent根据产品形态搭建整体架构地图（如分层、模块划分）。生成一份MD文档保存，后续开发遵循此地图，保持代码结构清晰，只在必要时调整架构。",
      "sourceTimestamp": 1136
    },
    {
      "title": "需求：使用Grill Me澄清",
      "content": "开发前使用 `grill me` 技能，让AI像面试官一样反问你需求细节，直到澄清所有隐含边界。它能生成详细的Context文档，防止因需求描述不清导致AI产出偏差，减少返工。",
      "sourceTimestamp": 759
    },
    {
      "title": "审查：让AI交叉Review",
      "content": "写完代码后，不仅依靠人工，更要让Agent进行自我审查或交叉审查（如Codex审Claude）。重点关注安全漏洞、边界条件和性能问题，让AI自动修复合规问题后再进行人工验收。",
      "sourceTimestamp": 928
    },
    {
      "title": "验证：构建自动化闭环",
      "content": "不要只生成代码，要关注能够形成闭环的Skill，如Playwright或Computer Use。只有让Agent能真正运行测试、验证结果并自动修复Bug，才能实现真正的无人值守自动化开发。",
      "sourceTimestamp": 665
    }
  ],
  "cards": [
    {
      "type": "method",
      "title": "需求审问：Grill Me",
      "explanation": "利用 `grill me` 等技能在开发前对模糊需求进行深度反问和澄清。这能有效防止因描述不清导致的开发偏差，确保AI产出的代码真正符合产品的原始需求。",
      "sourceTimestamp": 759
    },
    {
      "type": "reflection",
      "title": "失控感与责任",
      "explanation": "从每行代码必Review到完全信任AI，不仅是效率提升，也意味着将部分控制权和责任让渡给Agent。我们需要学会构建兜底机制，而非纠结于微观控制。",
      "sourceTimestamp": 2416
    },
    {
      "type": "method",
      "title": "自动化准则：DRY",
      "explanation": "遵循程序员 DRY 原则，任何重复做三次以上的工作（如同步代码、检查邮件、整理播客），都应该尝试将其封装成一个Skill，让Agent自动完成。",
      "sourceTimestamp": 2973
    }
  ],
  "actions": {
    "today": "审视自己的AI工作流，找出一个重复性步骤并尝试寻找对应Skill或设计自动化方案。",
    "thisWeek": "尝试使用“图片生成UI -> AI分层 -> 代码实现”的流程来重构或设计一个简单的落地页。",
    "longTerm": "搭建个人的数字资产管理Skill，自动同步播客、读书笔记并进行结构化索引，打造第二大脑。"
  }
}
```


═══════════════════════════════
## 学习包 B
═══════════════════════════════

```json
{
  "oneSentence": "编写专属AI Skills，解决高频重复工作，打造全自动化工作流。",
  "corePoints": [
    {
      "point": "判断标准：解决高频重复性工作或填补自身不擅长领域的空白。",
      "timestamp": 240
    },
    {
      "point": "利用真实验证类Skill让Agent自主跑测试，实现开发闭环。",
      "timestamp": 665
    },
    {
      "point": "Skill的真正价值在于自动化那些不起眼且繁琐的日常事务。",
      "timestamp": 2754
    }
  ],
  "audience": [
    "独立开发者",
    "AI编程探索者",
    "效率工具极客"
  ],
  "valueScore": {
    "density": 9,
    "novelty": 8,
    "actionability": 10
  },
  "estimatedCostMinutes": 7,
  "steps": [
    {
      "title": "制定筛选与评估 Skill 的核心标准",
      "content": "在海量的 Skills 中，判断一个是否值得保留的核心标准有两个：一是它能否真正解决你每天或每周高频重复的工作，比如繁琐的部署和测试；二是它能否在你完全不懂、不擅长的领域为你提供专业辅助，例如前端设计或营销 SEO。遵循这两个标准，能有效避免盲目安装，确保引入的 Skill 都能切实提升效率。",
      "sourceTimestamp": 240
    },
    {
      "title": "让 AI 自主发现与匹配技术栈",
      "content": "在初始化一个新工程时，不需要手动去一个个试错。你可以直接让 Agent 调用类似 find skills 的元技能，自主去寻找并匹配适合当前项目技术栈的最佳实践规范。将这些技术栈相关的约束放在项目目录下，能有效防止 Agent 生成带有安全漏洞或奇异逻辑的代码，建立起基础的开发规范防线。",
      "sourceTimestamp": 77
    },
    {
      "title": "利用 Grill Me 等 Skill 澄清需求",
      "content": "在让 AI 写代码前，最怕需求描述不清导致结果偏差。可以引入 Grill Me 这样的技能，让它像审问一样不断反问你需求背后的细节和边界条件，直到完全澄清，最终生成标准化的上下文文档。这能极大减少信息损耗，让 AI 开发的功能与真实诉求高度对齐，避免后期大规模返工。",
      "sourceTimestamp": 762
    },
    {
      "title": "构建带有真实验证的开发闭环",
      "content": "AI 编程最关键的一步是真实验证。与其单纯写提示词，不如写循环。利用自动化测试工具或内置的电脑操控能力，让 Agent 能够自己去操作模拟器、点击界面、运行端到端测试并查看运行结果。只有当 Agent 能够自主完成编写、运行、验证、修Bug的完整闭环时，开发流程才算真正实现自动化。",
      "sourceTimestamp": 665
    },
    {
      "title": "通过图片生成与分层实现前端设计",
      "content": "面对不擅长的前端设计，不要直接让 AI 硬写。可以先找参考图喂给大模型，让其结合你的产品内容生成高保真的设计图。接着利用大模型的图像切分能力提取素材，最后再把这些图片和素材交给编程 Agent 去还原成网页。这种图生代码的路径能避开浓重的 AI 味，大幅提升视觉质感。",
      "sourceTimestamp": 1503
    },
    {
      "title": "将日常繁琐事务封装为自动化 Skill",
      "content": "遵循 DRY（不要重复自己）原则，如果一件事你做了三次以上，就该写个 Skill 了。不管是检查客服邮件、监控美股持仓、同步多端代码，还是整理播客笔记，都可以把你的处理流程告诉 AI，让它帮你自动编排成一个专属 Skill，并结合定时任务自动执行，彻底从繁琐的日常事务中解放出来。",
      "sourceTimestamp": 2754
    }
  ],
  "cards": [
    {
      "type": "method",
      "title": "用 AI 解密并生成爆款推文",
      "explanation": "通过自己编写的自定义 Skill，将播客平台的 Transcript 提取出来，利用解密的形式进行内容重塑与总结。将其转化为一篇高质量的长文章后，直接发布到社交媒体平台。这种方法不仅能高效盘活历史音频数字资产，还能借助优质内容实现极佳的曝光和引流效果。",
      "sourceTimestamp": 1907
    },
    {
      "type": "reflection",
      "title": "放下对 AI 的“失控感”",
      "explanation": "在使用高级 Agent 和各种 Skill 时，很多人会感到失控，担心权限过大或行为不可控。然而，随着 AI 能力的提升，我们需要逐渐适应并放下这种失控感。接受让 AI 替我们掌控和消化信息，不再死盯每一行代码。但这也意味着，作为人类，我们必须学会为 AI 的最终产出承担兜底责任。",
      "sourceTimestamp": 2156
    },
    {
      "type": "opinion",
      "title": "Skill 是盘活个人数字资产的最佳工具",
      "explanation": "过去我们在各种笔记软件里沉淀的文字，往往因为换平台或懒得翻阅而沦为死资产。而如今通过编写专属的知识管理 Skill，结合 Agent 的自动化能力，可以每天自动抓取播客、读书笔记等内容，编译成结构化的知识图谱。这让沉睡的历史数据重新被检索、被唤醒，真正构建起活跃的第二大脑。",
      "sourceTimestamp": 1741
    }
  ],
  "actions": {
    "today": "盘点今天重复了三次以上的操作，挑出一个最适合自动化的任务，准备编写你的第一个自定义 Skill。",
    "thisWeek": "安装试用 Grill Me 提示词或类似 Skill，在让 AI 编写复杂功能前，先用它来反问并彻底澄清需求边界。",
    "longTerm": "培养“写循环而非写提示词”的编程思维，逐步构建包含自动测试与验证步骤的完整 AI 开发闭环。"
  }
}
```


═══════════════════════════════
## 学习包 C
═══════════════════════════════

```json
{
  "oneSentence": "判断Skills价值标准：解决重复性工作与补足非擅长领域。",
  "corePoints": [
    {
      "point": "Skills价值标准是解决重复工作或补足非擅长领域。",
      "timestamp": 246
    },
    {
      "point": "Coding核心是构建包含真实验证环节的完整Loop。",
      "timestamp": 665
    },
    {
      "point": "遵循DRY原则，重复三次以上的工作就该写成Skills。",
      "timestamp": 2978
    }
  ],
  "audience": [
    "开发者",
    "独立产品制作人",
    "AI工作流爱好者"
  ],
  "valueScore": {
    "density": 8,
    "novelty": 7,
    "actionability": 9
  },
  "estimatedCostMinutes": 8,
  "steps": [
    {
      "title": "步骤1 明确Skills筛选标准",
      "content": "不要盲目跟风安装Skills，判断标准只有两个：一是看它能否帮你解决每天、每周高频发生的重复性劳动；二是看它能否在你完全不熟悉或不擅长的领域（如前端设计、营销推广）为你提供专业级的指导与最佳实践。",
      "sourceTimestamp": 246
    },
    {
      "title": "步骤2 掌握需求澄清利器",
      "content": "在让AI写代码前，使用MattPocock的“Skills for Real Engineers”中的Grill Me功能。让AI反向审问你的需求，直到把所有边界条件和细节澄清，并生成context.md文件，避免信息损耗导致开发返工。",
      "sourceTimestamp": 751
    },
    {
      "title": "步骤3 搭建验证闭环工作流",
      "content": "不要只关注代码生成，真正有用的是能帮Agent做真实验证的Skills（如Playwright、Computer Use）。用Loop驱动提示词，让Agent完成代码编写后自动进行格式化、类型检查、单测和端到端测试，实现开发闭环。",
      "sourceTimestamp": 665
    },
    {
      "title": "步骤4 尝试架构先行的开发模式",
      "content": "拿到Idea后，先让AI帮忙探讨技术栈并画出代码库的分层架构地图（如DB层、API层）。之后给Agent派发功能时，只检查代码改动是否落在架构地图的正确位置，彻底放弃对代码细节的洁癖。",
      "sourceTimestamp": 1047
    },
    {
      "title": "步骤5 用图像生成突破设计瓶颈",
      "content": "做Landing Page时，不要依赖内置设计Skill。先找参考图，用ChatGPT的Image Gen生成融合你产品内容的网页效果图，再让AI分层提取素材，最后交由Codex实现代码，这样出来的效果更自然。",
      "sourceTimestamp": 1463
    },
    {
      "title": "步骤6 坚守DRY原则自建Skills",
      "content": "牢记“Don't Repeat Yourself”原则，任何手工做过三次以上的操作（如多端代码同步、客服邮件翻译润色、播客转结构化笔记），都应该交给AI Agent帮你编排成一个专属Skill，通过Automation自动运行。",
      "sourceTimestamp": 2978
    }
  ],
  "cards": [
    {
      "type": "method",
      "title": "用Grill Me消除信息损耗",
      "explanation": "需求不清晰是AI开发最大的坑。使用Grill Me技能让AI像产品经理一样反向追问你，把模糊的需求转化为详尽的context.md文档。这解决了从产品意图到开发实现的翻译损耗，让AI真正理解你要什么，而不是盲目猜测。",
      "sourceTimestamp": 751
    },
    {
      "type": "opinion",
      "title": "从看代码到看架构地图",
      "explanation": "AI Coding带来了认知转变：开发者不再逐行Review代码细节或纠结命名美观，而是转变为系统架构师。只关注Git Diff中的文件修改是否落在预设的架构地图版图内，代码实现细节完全可以放心交给AI处理。",
      "sourceTimestamp": 1263
    },
    {
      "type": "reflection",
      "title": "对AI的失控感正在消解",
      "explanation": "一年前人们还担心给AI过大权限像在装监控，如今大家都习惯了全局控制。面对复杂的网红Skills会担心失控，但面对AI产出的代码却不再Review。这种失控感的消解，标志着人机协作信任关系的重构。",
      "sourceTimestamp": 2194
    }
  ],
  "actions": {
    "today": "梳理今天做过的重复性电脑操作，找出一个手工做过超过三次的任务。",
    "thisWeek": "安装Grill Me技能，在下次给AI提需求前，让它先反向审问你一次。",
    "longTerm": "为你的项目建立架构地图文档，并沉淀一套包含自动化测试的专属Skills集。"
  }
}
```


═══════════════════════════════
## 学习包 D
═══════════════════════════════

```json
{
  "oneSentence": "AI Skills需按需选择，解决重复工作并补足知识短板，而非盲目追随热门。",
  "corePoints": [
    {
      "point": "Skills选择标准：解决重复工作和补足知识短板",
      "timestamp": 76
    },
    {
      "point": "技术栈相关Skills最必要，应放在工程目录",
      "timestamp": 82
    },
    {
      "point": "最有用的Skills是能进行真实验证的，如测试部署",
      "timestamp": 665
    },
    {
      "point": "编写个人化Skills比追随热门更有价值",
      "timestamp": 2131
    },
    {
      "point": "Skills适合自动化日常工作和知识管理",
      "timestamp": 2757
    }
  ],
  "audience": [
    "程序员",
    "AI工具用户",
    "产品经理",
    "效率提升爱好者"
  ],
  "valueScore": {
    "density": 8,
    "novelty": 7,
    "actionability": 9
  },
  "estimatedCostMinutes": 7,
  "steps": [
    {
      "title": "步骤1：理解Skills选择标准",
      "content": "判断一个Skill是否值得使用主要看两点：一是解决重复性工作，二是补足自身不擅长的知识领域。不要盲目追随热门Skills，而应从实际需求出发。技术栈相关的Skills通常是最必要的，但应放在工程目录而非全局。",
      "sourceTimestamp": 76
    },
    {
      "title": "步骤2：应用技术栈相关Skills",
      "content": "在初始化工程时，使用\"find skills\"让Agent寻找必要的技术栈相关Skills，如React最佳实践等。这些Skills能帮助Agent遵循最佳实践，避免写出有安全或边界问题的代码。将这类Skills放在工程目录下，而非全局目录。",
      "sourceTimestamp": 82
    },
    {
      "title": "步骤3：选择能进行真实验证的Skills",
      "content": "最有用的Skills是那些能让Agent对迭代结果进行真实验证的，如Playwright测试和Cortex内置的computer use。这类Skills能帮助开发任务真正闭环，完成整个循环。验证步骤对于人来说通常是繁琐且效率低下的，因此让AI自动完成特别有价值。",
      "sourceTimestamp": 665
    },
    {
      "title": "步骤4：在开发工作流中应用Skills",
      "content": "建立包含需求讨论、计划执行、代码审查和发布验证的完整工作流程。使用\"grill me\"这类Skill帮助澄清需求细节，避免信息损失。让AI自行审查代码，从安全和性能视角检查问题。最后，让AI自行验证和发布，减少人工干预。",
      "sourceTimestamp": 906
    },
    {
      "title": "步骤5：编写个人化Skills",
      "content": "不要只依赖现成Skills，可根据自己的工作流程编写个性化Skills。例如，将日常重复性工作(如邮件处理、代码同步、监控等)自动化。编写Skills时也不需要手动编码，可以描述工作流程让AI帮助完成。个人Skills往往比通用热门Skills更实用。",
      "sourceTimestamp": 2131
    },
    {
      "title": "步骤6：用Skills管理数字资产",
      "content": "利用Skills自动化管理个人数字资产，如播客内容、读书笔记等。可编写Skills定期同步和编译内容为结构化知识，方便后续检索。Skills特别适合处理看似不起眼但每天重复的日常事务，这些恰恰是最值得自动化的。",
      "sourceTimestamp": 2659
    }
  ],
  "cards": [
    {
      "type": "opinion",
      "title": "Skills不是越多越好",
      "explanation": "安装过多Skills可能导致Agent行为混乱，增加token消耗，甚至产生失控感。应采取保守策略，只在实际使用过程中发现Agent能力确实缺失时才安装相关Skills。不要被热门网红Skills吸引，而应关注实际需求。",
      "sourceTimestamp": 2146
    },
    {
      "type": "method",
      "title": "设计与开发分离策略",
      "explanation": "前端设计可采用\"先设计后实现\"的策略：先用ChatGPT生成想要的页面风格图片，从中提取所需素材，再让Claude或Codex实现代码。这种方法特别适合landing page等对架构要求不高的页面，能有效避免纯AI生成的典型设计感。",
      "sourceTimestamp": 1503
    },
    {
      "type": "reflection",
      "title": "对AI的信任与失控感",
      "explanation": "随着AI能力提升，人们逐渐从必须掌控AI产出的所有内容，转变为可以让AI自主掌控更多内容。这种变化伴随着心理接受度的提高，但也意味着我们需要为AI的行为背负责任。真正出问题时，负责的是人类而非AI。",
      "sourceTimestamp": 2421
    }
  ],
  "actions": {
    "today": "检查你的工作流，找出一个重复性任务，探索是否有相关Skills可以自动化它。",
    "thisWeek": "尝试编写一个个人化Skills来解决你日常工作中最繁琐的一个环节，不必追求完美。",
    "longTerm": "建立自己的Skills库，逐步将重复性工作和知识管理任务自动化，形成第二大脑。"
  }
}
```


═══════════════════════════════
## 学习包 E
═══════════════════════════════

```json
{
  "oneSentence": "探讨如何利用AI技能优化工作流，提高效率。",
  "corePoints": [
    {
      "point": "介绍AI学习软件otherwise的功能，如转录、提取、总结、分析播客内容，嵌入知识管理工作流等。",
      "timestamp": 12
    },
    {
      "point": "讨论如何评估一个技能的实用价值，包括解决重复性工作和帮助在陌生领域的知识获取。",
      "timestamp": 72
    },
    {
      "point": "分享编程领域的实用技能，如前端设计、设计系统构建，以及自动化测试验收流程。",
      "timestamp": 163
    },
    {
      "point": "探讨如何利用AI技能进行项目设计，包括需求描述和验证。",
      "timestamp": 737
    },
    {
      "point": "讨论如何创建自己的技能，包括日常工作、个人笔记管理、投资建议等。",
      "timestamp": 2837
    },
    {
      "point": "强调技能的使用应遵循DRY原则，避免重复工作，并提高效率。",
      "timestamp": 2973
    }
  ],
  "audience": [
    "程序员",
    "产品经理",
    "技术工作者"
  ],
  "valueScore": {
    "density": 8,
    "novelty": 7,
    "actionability": 9
  },
  "estimatedCostMinutes": 8,
  "steps": [
    {
      "title": "步骤1 标识重复性工作",
      "content": "思考你的日常工作中有哪些可以自动化的重复性任务。",
      "sourceTimestamp": 2837
    },
    {
      "title": "步骤2 研究现有技能",
      "content": "探索现有的AI技能，看是否有适合你工作流的。",
      "sourceTimestamp": 2837
    },
    {
      "title": "步骤3 创建自定义技能",
      "content": "根据你的需求，使用AI创建自定义技能。",
      "sourceTimestamp": 2837
    },
    {
      "title": "步骤4 测试和迭代",
      "content": "测试技能的效果，并根据需要进行迭代。",
      "sourceTimestamp": 2837
    },
    {
      "title": "步骤5 整合到工作流程中",
      "content": "将新技能整合到你的工作流程中，提高效率。",
      "sourceTimestamp": 2837
    },
    {
      "title": "步骤6 反馈和改进",
      "content": "分享你的经验和反馈，帮助改进技能。",
      "sourceTimestamp": 2837
    }
  ],
  "cards": [
    {
      "type": "opinion",
      "title": "技能评估标准",
      "explanation": "评估技能时应考虑其解决重复性工作的能力以及帮助在陌生领域的知识获取。",
      "sourceTimestamp": 72
    },
    {
      "type": "method",
      "title": "编程技能示例",
      "explanation": "分享编程领域的实用技能，如前端设计、设计系统构建，以及自动化测试验收流程。",
      "sourceTimestamp": 163
    },
    {
      "type": "reflection",
      "title": "技能创建过程",
      "explanation": "创建技能的过程涉及定义任务、编写工作流和测试效果。",
      "sourceTimestamp": 2837
    }
  ],
  "actions": {
    "today": "思考你的日常工作中有哪些重复性任务可以自动化。",
    "thisWeek": "研究一些现有的AI技能，看是否有适合你工作流的。",
    "longTerm": "尝试创建你自己的AI技能，以提高工作效率。"
  }
}
```


═══════════════════════════════
## 学习包 F
═══════════════════════════════

```json
{
  "oneSentence": "选对 Skills 弥补短板，用 Loops 替代 Prompts，构建高效的 AI 编程与自动化工作流。",
  "corePoints": [
    {
      "point": "只在解决重复性工作或弥补知识盲区时引入 Skills",
      "timestamp": 249
    },
    {
      "point": "真正的价值在于闭环验证，用 Loops 驱动替代单纯写 Prompt",
      "timestamp": 692
    },
    {
      "point": "编码工作流转变为：忽略代码细节，关注架构地图与最终结果",
      "timestamp": 1261
    }
  ],
  "audience": [
    "开发者",
    "独立黑客",
    "AI 工具极客"
  ],
  "valueScore": {
    "density": 8,
    "novelty": 8,
    "actionability": 9
  },
  "estimatedCostMinutes": 8,
  "steps": [
    {
      "title": "按需筛选 Skills",
      "content": "不要试图安装所有热门 Skills。利用 find skills 工具，只安装当前工程必要的技术栈规范（如 React Best Practices），并将其安装在工程目录而非全局，保持 Agent 环境的精简和针对性。",
      "sourceTimestamp": 82
    },
    {
      "title": "判断两类高价值场景",
      "content": "值得使用的 Skills 通常分为两类：一是解决高频重复性工作（如每天构建测试、运维检查）；二是不熟悉的领域（如营销、SEO），利用现成的专业知识库弥补自身短板。",
      "sourceTimestamp": 249
    },
    {
      "title": "使用 Grill Me 澄清需求",
      "content": "在开始编码前，使用 Skills for Real Engineers 中的 Grill Me。它会让 AI 反过来审问你的需求细节，挖掘隐含条件，生成清晰的 Context.md 文档，防止因需求描述不清导致开发偏差。",
      "sourceTimestamp": 762
    },
    {
      "title": "构建闭环验证 Loops",
      "content": "不要只写 Prompt，要写 Loops。利用 Playwright 或 Computer Use 等 Skills 让 AI 能够进行真实验证和自测，只有当 AI 能自我验证结果时，开发任务才算真正完成闭环。",
      "sourceTimestamp": 692
    },
    {
      "title": "转变开发视角：重结果轻代码",
      "content": "改变逐行审查代码的习惯。关注点应从代码洁癖转移到架构地图（Architecture Map）的正确性，以及最终功能是否跑通。让 AI 自我 Review 或交叉 Review，你只需把控核心逻辑。",
      "sourceTimestamp": 1261
    },
    {
      "title": "通过图转码实现前端设计",
      "content": "为避免前端出现“AI 味”，可先用 DALL-E 生成 Landing Page 设计图，再让 AI 提取素材并分层，最后由 Codex 还原成代码。这样既保证了设计感，又实现了落地。",
      "sourceTimestamp": 1503
    }
  ],
  "cards": [
    {
      "type": "method",
      "title": "Grill Me 需求审问",
      "explanation": "在给 AI 布置开发任务前，使用 Grill Me Skill 让 AI 反向提问，挖掘需求背后的隐含细节和边界条件，生成清晰的开发文档，防止需求理解偏差。",
      "sourceTimestamp": 762
    },
    {
      "type": "opinion",
      "title": "Loops > Prompts",
      "explanation": "单纯写 Prompt 容易中断，未来趋势是编写 Loops（工作流）。通过构建包含验证步骤的完整闭环，让 AI 自我驱动完成任务，而非人工反复介入。",
      "sourceTimestamp": 692
    },
    {
      "type": "reflection",
      "title": "DRY 原则与失控感",
      "explanation": "遵循程序员 DRY 原则，任何重复三次的工作都应封装成 Skill。虽然会担心 AI 失控，但信任 AI 承担责任并构建自动化循环是效率提升的必经之路。",
      "sourceTimestamp": 2973
    }
  ],
  "actions": {
    "today": "清理不常用的网红 Skills，尝试使用 grill me 梳理一个开发需求。",
    "thisWeek": "挑选一个日常重复琐事（如查邮件、看日志），利用 AI 编写一个专属 Skill。",
    "longTerm": "建立包含自动化测试、验证、部署的完整 AI 开发 Loops，逐步脱离代码细节审查。"
  }
}
```

