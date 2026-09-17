import { defineConfig } from 'cz-git';

export default defineConfig({
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['root', 'backend', 'frontend', 'types', 'agent', 'ui', 'motion', 'config', 'deps'],
    ],
    'scope-empty': [0, 'always'],
  },
  prompt: {
    // 中文交互界面
    messages: {
      type: '选择你要提交的更改类型:',
      scope: '选择更改影响的范围（与 scope-enum 保持一致）:',
      customScope: '请输入自定义的 scope:',
      subject: '填写简短精炼的变更描述（祈使句，小写开头）:',
      body: '填写更加详细的变更描述（可选）。使用 "|" 换行:',
      breaking: '列举非兼容性重大变更（可选）。使用 "|" 换行:',
      footerPrefixesSelect: '选择关联 issue 前缀（可选）:',
      customFooterPrefix: '输入自定义 issue 前缀:',
      footer: '列举此更改关联的 issue（可选）。例如: #31, #34:',
      confirmCommit: '确认提交?',
      generatingByAI: 'AI 正在生成提交标题...',
      generatedSelectByAI: '从 AI 生成的候选中选择合适的标题:',
    },
    // 自定义发送给 AI 的提示词（cz-git 默认用英文 prompt，所以这里强制要求输出简体中文）
    aiQuestionCB: ({ maxSubjectLength, diff }) =>
      [
        '你是一名资深工程师，正在编写遵循 Conventional Commits 规范的 Git 提交信息。',
        '请阅读下面的 git diff，生成一句简体中文的提交标题（subject），要求：',
        '1. 以动词开头，简明扼要概括本次改动，避免空话套话；',
        '2. 只输出 subject 本身：不要带 type/scope 前缀，不要引号，不要以句号结尾；',
        `3. 长度不要超过 ${maxSubjectLength} 个字符。`,
        '',
        '以下是代码 diff：',
        diff,
      ].join('\n'),
    // scope 未显式配置时，cz-git 会自动读取上方 commitlint 的 scope-enum 规则生成候选列表
    useEmoji: false,
    allowCustomScopes: false,
    allowBreakingChanges: ['feat', 'fix'],
    types: [
      { value: 'feat', name: 'feat:     ✨ 新特性', emoji: '✨' },
      { value: 'fix', name: 'fix:      🐛 修复缺陷', emoji: '🐛' },
      { value: 'docs', name: 'docs:     📚 文档更新', emoji: '📚' },
      { value: 'style', name: 'style:    💎 代码格式', emoji: '💎' },
      { value: 'refactor', name: 'refactor: 📦 代码重构', emoji: '📦' },
      { value: 'perf', name: 'perf:     🚀 性能优化', emoji: '🚀' },
      { value: 'test', name: 'test:     🚨 自动化测试', emoji: '🚨' },
      { value: 'build', name: 'build:    🛠️ 构建与依赖', emoji: '🛠️' },
      { value: 'ci', name: 'ci:       ⚙️ 持续集成', emoji: '⚙️' },
      { value: 'chore', name: 'chore:    ♻️ 日常维护', emoji: '♻️' },
      { value: 'revert', name: 'revert:   🗑️ 回滚提交', emoji: '🗑️' },
    ],
  },
});
