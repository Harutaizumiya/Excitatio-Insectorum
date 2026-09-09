# 课序 · 前端 Web 应用 (@repo/web)

本应用是基于 **Vite 8 + React 19 + React Router 7** 构建的高性能单页应用（SPA / CSR）。

## 技术栈

- **构建与打包**：Vite 8 (`v8.2.x`) + `@vitejs/plugin-react` (Oxc Fast Refresh)
- **UI 框架与样式**：React 19, Tailwind CSS v4 (`@tailwindcss/vite`), Ant Design 6, shadcn/ui, Lucide Icons
- **后台管理**：Refine (`@refinedev/antd`, `@refinedev/react-router`)
- **路由**：React Router 7 (`react-router-dom`)
- **状态与实时**：TanStack React Query, Socket.IO Client

## 路由结构

- `/`：首页智能重定向
- `/login`：班主任登录面板
- `/admin/*`：班主任管理后台（班级概览、学生、座位、课表、教师、积分规则、流水与设备）
- `/teacher`：任课教师移动优先课堂操作面板
- `/display`：班级大屏展示面板
- `/display/bind`：大屏设备 PIN 码绑定面板
- `/invite/:token`：任课教师邀请激活面板

## 开发与构建

```bash
# 启动本地开发服务 (端口 3001，自动反代后端 /api 与 /socket.io)
pnpm dev

# 生产环境打包 (输出至 dist/)
pnpm build

# 本地预览构建产物
pnpm preview

# 类型检查与代码规范
pnpm typecheck
pnpm lint
```
