# 学生端前端 · 运行时流程

一次课堂从打开页面到下课，浏览器里依次发生了什么。

> 配套：[前端架构](ARCHITECTURE.md)、[Next.js 学生端前端流程图](NEXT_FRONTEND_WORKFLOW.md)、[后端接口说明](../api/后端接口说明.md)。流程图以 Mermaid Markdown 为准，不再依赖旧 SVG。

---

## A · 页面加载

1. **浏览器请求页面** → Next.js 返回预渲染的 `/` 页面
2. **根布局中的内联脚本先跑** → 读 `localStorage` 或系统偏好，定下 `data-theme`（在样式表之前，避免深色系统下闪一帧白）
3. **加载 `src/app/globals.css`** → 主题已定，不会渲染错配色
4. **React hydration** → `StudentApp` 变为可交互的 Client Component
5. **动态加载 `src/legacy/app.js`** → 建 8 个模块实例 → 各模块 `mount()` 绑自己的事件 → 按 hash 显示入口页

> 第 5 步之前不绑任何事件。`idle`/`chat`/`video` 指向**同一个实例**（同属「引导学习」那一幕）。

---

## B · 入口页

6. **显示两张卡**（课堂 / 课后）—— 这一步没有任何后端请求
7. **（可选）切主题** → 改根节点属性 → 所有 CSS 变量重算 → 全页配色变（没有一行 JS 逐个改元素）

---

## C · 进课堂

8. **点「课堂」卡片** → 只改 hash → 触发 `hashchange` → 路由
   （不直接调函数，是为了让浏览器前进/后退键也能用，且只有一条代码路径）
9. **视图切换 + 拉课时** → 入口页淡出 320ms、课堂视图淡入；同时 `GET /api/lesson` 填课前卡

---

## D · 一节课的 6 幕

10. **点「开始上课」** → **先本地切到对话界面**（不等网络）→ 同时发 `POST /api/chat` `/上课开始`
11. **后端返回** `hostPhase: "intro"` → AI 介绍出现 + 「开始播放教学视频」按钮
    → `applyServerTurn` 发现"已经在目标界面了"，界面不变（这是刻意的，让网络延迟不影响体感）
12. **点「开始播放教学视频」** → 本地切到视频界面，**不发请求**
13. **视频加载** → `GET /api/lesson/video` 拿地址 → `GET *.mp4`（浏览器会发多个 Range 请求）
14. **视频播完**（`ended` 事件，或点「看完了」）→ `POST /api/chat` `/视频结束`
15. **后端返回** `hostPhase: "recap_discussion"` → 立即切到写作区
16. **提交总结** → `POST /api/summary/review` → 四色反馈卡（空数组的块自动跳过）
17. **点「进入下一阶段」** → `POST /api/chat` `/继续`（**推不推由后端判定**）
18. **后端返回** `hostPhase: "deep_inquiry"` → 立即切到三张卡
19. **答三张卡** → 每张 `POST /api/reflection` → 卡内出现 AI 点评，收起输入区
20. **点「进入课堂讨论」** → `POST /api/chat` `/继续` → `class_discussion` → 立即切到讨论区
21. **讨论区加载** → `GET /api/discussion` → 讨论题 + 发言**逐条间隔 520ms 出现**
22. **发言** → `POST /api/discussion` → 自己的发言追加，老师追问随后出现
23. **点「结束本节课」** → `POST /api/chat` `/下课` → 收尾发言 + `hostPhase: "ending"` → 立即切到结束态

---

## E · 结束

24. **点「去看看掌握情况」** → 跳课后（占位）

---

## 整个过程只有一种模式

```
学生做某个动作
    ↓
前端发一条消息（自然语言，或以 / 开头的控制消息）
    ↓
后端返回 hostPhase
    ↓
前端比对：变了 → 立即切换界面，不播放页面或阶段切换动画
          没变 → 什么都不做
```

**前端不参与"该不该切幕"的判断**——那是后端编排器的职责。

**切换时序**：更新 `hostPhase` → 映射目标 Stage → 同步更新显隐 → 调用目标模块的 `enter()`。消息、Toast、悬停等局部反馈动画仍独立保留。

---

## 网络请求汇总

| 时机 | 请求 | 返回 |
| --- | --- | --- |
| 进课堂 | `GET /api/lesson` | 课时信息 |
| 开始上课 | `POST /api/chat` `/上课开始` | 介绍 + `intro` |
| 播放视频 | `GET /api/lesson/video` | 视频地址 |
| 视频加载 | `GET *.mp4`（Range） | 视频数据 |
| 视频结束 | `POST /api/chat` `/视频结束` | `recap_discussion` |
| 提交总结 | `POST /api/summary/review` | 四块反馈 |
| 进入下一阶段 | `POST /api/chat` `/继续` | `deep_inquiry` |
| 答三张卡 | `POST /api/reflection` × 3 | AI 点评 |
| 进入讨论 | `POST /api/chat` `/继续` | `class_discussion` |
| 进讨论区 | `GET /api/discussion` | 讨论题 + 发言 |
| 发言 | `POST /api/discussion` | 自己的发言 |
| 结束 | `POST /api/chat` `/下课` | 收尾 + `ending` |

**其中 4 个是 `/api/chat`** —— 每次对应一次"前端说一句话、后端决定演到哪一幕"。

---

## 贯穿全程

- **状态胶囊**跟着 `hostPhase` 走，是学生判断"现在在哪一幕"的唯一依据
- **`sessionId` 全程不变**（存 `localStorage`）—— 它是后端 checkpointer 的 `thread_id`，刷新页面后端还能接上
- **每个请求都带 `now` 时间戳** —— 前端先带上，用不用由后端决定
  > ⚠️ 前端时间不可信（学生能改系统时间）。**切幕必须用服务端时间。**
