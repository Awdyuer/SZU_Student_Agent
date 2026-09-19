# AI 学习空间 · 学生端

面向学生的 AI 课堂前端。把「每节课 4 阶段逐步加深」的教学模型做成学生看得见的界面。

基于 **Next.js App Router + React** 实现。课堂主体运行在 Client Component 中，后端仍保持为独立服务；前端只根据后端下发的 `hostPhase` 更新课堂阶段。

---

## 教学模型

一节课拆成 4 个阶段，每阶段占课堂时间的固定比例：

| 阶段 | 时间占比 | 学生做什么 | 界面上是什么 |
| --- | --- | --- | --- |
| **引导学习** | 0–50% | 听讲解、看视频、随时提问 | AI 对话 + 教学视频 |
| **总结复述** | 50–70% | 用自己的话把刚学的写一遍 | 写作区 + AI 结构化反馈 |
| **深入思考** | 70–85% | 想底层逻辑、能解决什么问题、和别的学科的关系 | 三张卡逐个展开 |
| **课堂讨论** | 85–100% | 老师引导，同学之间交流 | 老师 / 同学 / 我 的讨论区 |

页头右上方始终显示**当前处于哪一幕**（课程介绍 / 引导学习 / 总结复述 …）。页面和课堂阶段切换会立即完成，不播放切换动画。

**前端不决定演到哪一幕。** 每次后端响应回来后比对 `hostPhase`，变了才切界面 —— 切幕时机由后端的编排器 `judge_advance` 决定（真实时钟 + 证据 + 策略，见 `docs/architecture/ORCHESTRATOR.md`）。

---

## 功能

- **入口**：课堂 / 课后 两个入口
- **课堂**：完整的 4 阶段流程，从课前课程卡一路走到结束态
- **课后**：预留中，见「已知限制」
- **深浅色主题**：浅色 / 深色 / 跟随系统，右上角切换，带首屏防闪
- **视频**：本地测试片（H.264）能播、能拖进度条；播完自动通知后端，也可手动点「看完了」
- **响应式**：窄屏卡片改单列
- **动效**：保留消息、提示和悬停等局部反馈；页面与课堂阶段切换不播放动画
- **可访问性**：键盘可达、焦点管理、`aria-live` 会话区

---

## 环境配置

### 环境要求

- Node.js **20.9 或更高版本**
- npm（随 Node.js 一起安装）
- Chrome 111+、Edge 111+、Firefox 111+ 或 Safari 16.4+

可以先确认本机环境：

```bash
node --version
npm --version
```

### 后端地址

项目默认使用本地 Mock 数据，不启动后端也能完整体验课堂流程。

需要连接独立后端时，在项目根目录复制环境变量模板：

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```bash
# macOS / Linux
cp .env.example .env.local
```

然后修改 `.env.local`：

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

同时把 `src/legacy/api.js` 中的 Mock 开关改为：

```js
export var USE_MOCK = false;
```

说明：

- 不设置 `NEXT_PUBLIC_API_BASE_URL` 时，请求默认发送到当前前端域名下的 `/api`。
- 前后端不同端口或域名时，后端需要允许前端地址进行 CORS 请求。
- `.env.local` 必须放在项目根目录，不要放进 `src/`，也不要提交到 Git。
- `NEXT_PUBLIC_` 变量会进入浏览器端代码，不能在其中保存密码、Token 或其他机密信息。
- 修改 `.env.local` 后需要重新启动开发服务器；生产环境变量需要在执行 `npm run build` 前设置。

## 快速启动

### Windows 双击演示

双击项目根目录的 [启动演示.cmd](启动演示.cmd)。脚本会检查 Node.js、首次运行时自动执行 `npm ci`、选择 3000–3010 中的空闲端口，并在服务就绪后打开浏览器。保持启动窗口打开；演示结束后在窗口中按回车停止服务。默认使用 Mock 数据，无需启动后端。

也可在 PowerShell 中运行 `./scripts/start-demo.ps1`。

### 命令行启动

在项目根目录依次执行：

```bash
# 1. 按 package-lock.json 安装确定版本的依赖
npm ci

# 2. 启动开发服务器
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

如果 `3000` 端口被占用，Next.js 会提示实际使用的地址，也可以手动指定端口：

```bash
npm run dev -- --port 3001
```

### 生产环境启动

```bash
# 先执行代码检查
npm run lint

# 创建生产构建
npm run build

# 启动生产服务器
npm start
```

生产服务器默认访问地址同样是 `http://localhost:3000`。

---

## 目录结构

```
.
├── src/
│   ├── app/
│   │   ├── layout.js       根布局、页面元数据与主题首屏防闪
│   │   ├── page.js         学生端入口页面（Server Component）
│   │   └── globals.css     全局设计令牌与组件样式
│   ├── components/
│   │   ├── StudentApp.js   课堂客户端边界与初始化入口
│   │   └── legacyMarkup.js 迁移期间保留的页面结构
│   └── legacy/             迁移兼容层：课堂状态机、阶段与 API
├── public/                 Next.js 静态资源目录
├── next.config.mjs     Next.js 配置
├── package.json        依赖与开发/构建命令
├── docs/
│   ├── architecture/       架构、运行流程、编排器规范和 Mermaid 流程图
│   └── api/                后端接口契约
├── .env.example        后端地址配置示例
└── jsconfig.json       `@/` 指向 `src/`
```

**路由**（hash，刷新与前进后退都能用）

| hash | 页面 |
| --- | --- |
| `#` | 入口 |
| `#/class` | 课堂 |
| `#/review` | 课后 |

课堂里没有返回按钮，`Esc` 也禁用 —— 一旦开课就走完四个阶段。

---

## 技术说明

**Next.js 负责应用入口、根布局、页面元数据、全局样式和生产构建。** 当前迁移优先保证行为等价：原有课堂编排模块作为客户端兼容层挂载，后续可以按阶段逐步替换成独立 React 组件，而不需要再次改动接口契约。

**课堂主体是 Client Component。** 视频、主题、输入框、局部反馈动画、`localStorage` 与实时会话都依赖浏览器能力；后端接口仍然通过 `src/legacy/api.js` 访问，不在 Next.js 中重复实现业务后端。

**界面切换不依赖动画。** Hash 页面、课堂 Stage、总结编辑/反馈视图都直接更新显隐状态；消息、Toast、悬停等局部反馈动画不参与路由和阶段状态管理。

**主题只有两套规则。** `html[data-theme]` 只取 `light` / `dark`，「跟随系统」由 JS 监听 `matchMedia` 后代写，这样 CSS 不必把深色令牌写两遍。首屏防闪靠 `<head>` 里一段内联脚本在样式表之前定好属性。

## 后端对接

**所有接口目前走 mock。** 改 `src/legacy/api.js` 顶部一行即可切换到真实请求：

```js
export var USE_MOCK = false;
```

前端其余代码一行都不用动 —— 各阶段模块只 import `api.js` 的函数，不直接写 URL。

完整的接口契约、请求响应示例、以及后端需要补齐的能力清单，见 **[后端接口说明](docs/api/后端接口说明.md)**。

**想看它运行时一步步发生什么** → [运行时流程](docs/architecture/RUNTIME.md)（24 步）
**想看架构与模块职责** → [前端架构](docs/architecture/ARCHITECTURE.md)
**想看 Next.js 启动、路由、课堂阶段与 API 流程图** → [Next.js 学生端前端流程图](docs/architecture/NEXT_FRONTEND_WORKFLOW.md)（Mermaid，可直接在 Markdown 中预览）

---

## 已知限制

- 全部是本地假数据，**没有真实后端联调过**。
- 课后页面是空占位，接口契约已备好但未实现。
- 阶段 4 的多人讨论是单人 mock（后端目前 `student_id` 硬编码，无班级/讨论组结构）。
- 掌握度（0–5 星）在前端还没有展示。
- 目前只有一节课，不提供选课；多课程的接口契约写在 `docs/api/后端接口说明.md` 末尾。
