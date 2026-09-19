# Next.js 学生端前端流程图

本文是当前代码对应的流程图源文件，使用 Mermaid 编写；不依赖已删除的旧 SVG/HTML 导出。可在支持 Mermaid 的 Markdown 查看器中直接预览。

> 现状：Next.js App Router 只有 `/` 一个文件路由；入口、课堂和课后由浏览器 Hash 路由控制。课堂内的阶段由后端响应中的 `hostPhase` 决定，当前 `src/legacy/api.js` 默认使用 Mock。界面切换即时完成，不播放页面或阶段过渡动画。

## 1. 启动、渲染与客户端初始化

```mermaid
flowchart TD
    A[访问 /] --> B[Next.js 执行 RootLayout]
    B --> C[主题首屏脚本读取本地偏好]
    B --> D[加载 globals.css]
    B --> E[page.js 渲染 StudentApp]
    E --> F[服务端输出入口、课堂、课后的初始 HTML]
    F --> G[浏览器显示页面并完成 React hydration]
    G --> H[StudentApp 的 useEffect 动态导入 legacy/app.js]
    H --> I[读取或生成 sessionId 并保存到 localStorage]
    I --> J[创建主题控制器和各阶段模块]
    J --> K[每个唯一模块 mount 一次，绑定事件]
    K --> L[注册 hashchange 并执行 renderRoute]
    L --> M[根据当前 Hash 显示入口、课堂或课后]
```

`src/app/layout.js` 负责布局、元数据、主题首屏脚本和全局 CSS；`src/app/page.js` 渲染 `StudentApp`。`StudentApp` 是 Client Component，保留现有页面结构，并在挂载后导入 `src/legacy/app.js`。初始 HTML 不等于课堂业务已加载；业务事件绑定发生在动态导入之后。

## 2. 路由与页面切换

```mermaid
flowchart LR
    ROOT[Next.js 文件路由 /] --> APP[StudentApp]
    APP --> HASH{parseHash}
    HASH -->|空 Hash 或 #| HUB[hub：课堂/课后入口]
    HASH -->|#/class| CLASS[view-class：课堂]
    HASH -->|#/review| REVIEW[view-review：课后占位页]
    HASH -->|其他值| UNKNOWN[location.replace 到 #]
    UNKNOWN --> HUB
    HUB -->|点击课堂卡片| CLASS
    HUB -->|点击课后卡片| REVIEW
    REVIEW -->|返回按钮或 Esc| HUB
    CLASS -->|浏览器后退| HASH
```

| 地址或状态 | 控制者 | 结果 |
| --- | --- | --- |
| `/` | Next.js App Router | 加载学生端应用 |
| `#` 或空 Hash | `renderRoute()` | 显示入口和主题切换器 |
| `#/class` | `openLessonRoute()` | 显示课堂；首次进入时加载课时 |
| `#/review` | `renderRoute()` | 显示课后占位页 |
| 其他 Hash | `renderRoute()` | 回到入口 |
| `currentStage` | `setStage()` | 控制课堂内部的 `idle/chat/video/summary/reflect/discuss/done` |

Hash 切换直接修改显隐、焦点与滚动位置，不等待退场或入场动画。课堂没有页面内返回按钮，Esc 在课堂中不触发返回；浏览器自身的后退仍可改变 Hash。

## 3. 进入课堂与四阶段教学流程

```mermaid
flowchart TD
    A[进入 #/class] --> B{课时 lesson 已缓存?}
    B -->|否| C[显示 idle，禁用开始按钮]
    C --> D[fetchLesson 获取课程信息]
    D -->|成功| E[填充课时卡片并启用开始按钮]
    D -->|失败| F[显示错误并弹出 Toast]
    B -->|是| G[恢复 currentStage]
    E --> H[点击开始上课]
    H --> I[sendChat：/上课开始]
    I --> J[hostPhase = intro]
    J --> K[chat：课程介绍与 AI 对话]
    K --> L[点击播放教学视频]
    L --> M[前端局部切到 video 并获取视频信息]
    M --> N{视频结束方式}
    N -->|自然播放完| O[发送 /视频结束]
    N -->|手动点击看完了| O
    O --> P[hostPhase = recap_discussion]
    P --> Q[summary：填写总结]
    Q --> R[reviewSummary 返回结构化反馈]
    R --> S{学生选择}
    S -->|我再改一版| Q
    S -->|进入下一阶段| T[发送 /继续]
    T --> U[hostPhase = deep_inquiry]
    U --> V[reflect：逐张完成思考卡]
    V --> W[submitReflection 返回点评]
    W --> X{三张卡完成?}
    X -->|否| V
    X -->|是| Y[发送 /继续]
    Y --> Z[hostPhase = class_discussion]
    Z --> AA[discuss：加载题目和讨论消息]
    AA --> AB[学生发言，显示讨论反馈]
    AB --> AC[点击结束本节课，发送 /下课]
    AC --> AD[hostPhase = ending]
    AD --> AE[done：结束态和知识点清单]
    AE --> AF[点击去看看掌握情况，进入 #/review]
```

图中 `hostPhase` 表示服务端响应的权威状态；默认 Mock 会模拟同样的字段。真实后端是否推进阶段由后端决定，前端的“继续”按钮只发控制消息。`chat → video` 是 `guided_learning` 内的前端局部切换，点击播放时不发送阶段推进请求；视频结束后才通知后端。

## 4. `hostPhase` 到课堂界面的映射与判定

| `hostPhase` | `uiOf()` 目标 | 学生看到的界面 |
| --- | --- | --- |
| `uninitialized` | `idle` | 课前卡片 |
| `intro` | `chat` | 课程介绍/对话 |
| `guided_learning` | `chat` | 引导学习对话；视频是局部状态 |
| `recap_discussion` | `summary` | 总结复述 |
| `deep_inquiry` | `reflect` | 深入思考 |
| `class_discussion` | `discuss` | 课堂讨论 |
| `ending` | `done` | 课程结束 |

```mermaid
flowchart TD
    A[收到含业务结果的 API 响应] --> B{有 hostPhase?}
    B -->|否| C[只处理业务结果]
    B -->|是| D{isKnown?}
    D -->|否| E[记录警告，保持当前界面]
    D -->|是| F{与已保存的 hostPhase 相同?}
    F -->|是| G[不重复切换]
    F -->|否| H[保存 hostPhase 并更新页头状态]
    H --> I[uiOf 映射目标 Stage]
    I --> J{目标已是 currentStage?}
    J -->|是| K[保留当前界面]
    J -->|否| L{guided_learning 且正在看 video?}
    L -->|是| M[保留视频播放]
    L -->|否| N[setStage：隐藏其他 Stage，显示目标]
    N --> O[调用目标 owner.enter]
```

这里的 `applyServerTurn()` 只处理阶段变化。总结反馈、反思点评、讨论消息等各阶段的业务内容由对应模块分别渲染。页面和 Stage 切换均为即时显隐，消息、Toast、悬停等局部反馈动画仍保留。

## 5. API 与错误路径

```mermaid
flowchart TD
    A[课堂模块调用 src/legacy/api.js] --> B{USE_MOCK?}
    B -->|true，默认| C[本地 Mock + 模拟延时]
    B -->|false| D[读取 NEXT_PUBLIC_API_BASE_URL]
    D --> E[拼接 /api 路径并发起 fetch]
    E --> F{HTTP 响应成功?}
    F -->|否| G[抛出 HTTP 错误]
    F -->|是| H[解析 JSON]
    C --> I[返回业务结果]
    H --> I
    I --> J[阶段模块更新内容]
    I --> K{返回 hostPhase?}
    K -->|是| L[交给 applyServerTurn]
    K -->|否| M[保持当前课堂阶段]
    G --> N[调用方显示错误或允许重试]
```

| 请求 | 触发点 | 用途 |
| --- | --- | --- |
| `GET /api/lesson` | 首次进入课堂 | 课时信息 |
| `POST /api/chat` | 开课、提问、视频结束、继续、下课 | AI 回复与 `hostPhase` |
| `GET /api/lesson/video` | 点击播放视频 | 视频地址和元数据 |
| `POST /api/summary/review` | 提交总结 | 结构化反馈 |
| `POST /api/reflection` | 提交思考卡 | 点评与追问 |
| `GET /api/discussion` | 首次进入讨论 | 题目与消息 |
| `POST /api/discussion` | 学生发言 | 新消息 |

完整字段契约和预留接口见 [后端接口说明](../api/后端接口说明.md)。真实后端接入时将 `src/legacy/api.js` 的 `USE_MOCK` 置为 `false`，并在根目录 `.env.local` 配置 `NEXT_PUBLIC_API_BASE_URL`；该变量属于公开的浏览器端配置，不可存放密钥。

## 6. 文档维护边界

- 修改 Next.js 入口或 Hash 路由时，同步更新第 1、2 节。
- 修改 `src/legacy/phases.js` 或 `applyServerTurn()` 时，同步更新第 3、4 节。
- 修改 `src/legacy/api.js` 或阶段模块的请求时，同步更新第 5 节。
- 不再维护旧的独立 SVG/HTML 导出，避免图像与代码、Markdown 文档出现两个版本。
