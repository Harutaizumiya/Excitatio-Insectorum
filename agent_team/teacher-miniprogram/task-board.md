# 教师端小程序迁移

- 已采用：Luna / mini_runtime：Taro、会话及实时；额度中断后主 Agent 完成验收。
- 已采用：Luna / mini_pages：登录、课堂、19 类事件、流水、点名、喊话、我的；额度中断后主 Agent 收尾。
- 已采用：Luna / wechat_backend：微信身份、专用邀请、迁移、测试。
- 已采用：Sol / critical_review：两轮只读复核，发现的会话、实时及去重回执问题已修复。
- 已完成：主 Agent：Web 入口、积分及喊话结果核查、契约整合与验收。
- 已验证：根 lint/typecheck、99 项测试、构建、双 schema 校验及临时 SQLite 迁移。
- 外部验收：微信开发者工具、iOS/Android 真机、正式域名和平台审核。

用户确认：持邀请直接绑定；禁止自动合并账号与换绑。默认关闭微信集成，不动用户数据库或生产。

路由累计 3 个 gpt-6-luna/xhigh、1 个 gpt-6-sol/high，余 1 个预留名额未使用。两个编码 Agent 达到额度限制后未重启，主 Agent 使用已有代码完成交付。依当前平台要求使用任务内 Agent，没有创建独立聊天，不适用聊天归档。
