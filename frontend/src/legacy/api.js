/* ═══════════════════════════════════════════════════════════
   接口层 —— 后端「主动引导智能体」的 HTTP 契约
   ───────────────────────────────────────────────────────────
   前端不做教学判断：讲哪一段、问哪一题、什么时候切幕、打几星，
   全部由后端的编排器决定。这里只负责收发。

   后端实现在 apps/server.py，是同一台服务器的同一个源 ——
   前端静态文件挂在 FastAPI 的 /app 下，所以**不需要 CORS**。

   与后端交互的两条硬规矩，写在这里免得后来人踩：

   1. **转录只有一份。** 后端的 s["messages"] 同时装学生发言和 AI 回复，
      POST /message 会把这两条都追加进去；GET /messages?since=N 返回的
      就是这个列表的切片。所以 POST 的 reply_text **不能拿来渲染** ——
      否则每条回复会显示两遍。界面一律以 /messages 为唯一事实来源。
      （后端自带的 apps/static/index.html 就踩了这个，别照抄。）

   2. **不用后端的 phase_name。** 它的 STAGE_NAMES 只覆盖 4 个阶段，
      intro / uninitialized / ending 会原样回退成英文。
      中文词表在前端的 phases.js 里，那份是完整的。
   ═══════════════════════════════════════════════════════════ */

/* 同源。前端挂在 FastAPI 的 /app，接口在 /api，浏览器不认为是跨域。 */
var API_BASE = "";


/* ── 请求辅助 ────────────────────────────────────────────── */

function request(method, url, body) {
  var options = { method: method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  return fetch(API_BASE + url, options).then(function (res) {
    return res.json().catch(function () { return null; }).then(function (data) {
      if (res.ok) return data;
      /* FastAPI 的错误体是 { "detail": "..." } 。
         409 有明确含义：课还没开始 / 状态不允许（后端的 _running() 守卫），
         单独把状态码挂到 error 上，界面才能给出具体提示而不是「HTTP 409」。 */
      var message = (data && data.detail) || ("HTTP " + res.status);
      var err = new Error(message);
      err.status = res.status;
      err.detail = data && data.detail;
      return Promise.reject(err);
    });
  });
}


/* ═══════════════════════════════════════════════════════════
   ① 课程与课时

   后端**没有**「取课时信息」的接口 —— 课时的标题、知识点、片段是
   lesson-data/lesson-plan.json 与 lesson-data/segments/*.json 里的静态配置，
   只用于界面文案，不参与编排。所以这里照抄一份。
   下面的 6 个知识点与 rules/KNOWLEDGE-BASE.md 的 KP-001…KP-006 逐条对应。
   ═══════════════════════════════════════════════════════════ */

export var LESSON_ID = "ch3-process-scheduling";

export var LESSON = {
  lessonId: LESSON_ID,
  course: "操作系统",
  chapter: "第 3 周",
  title: "处理机调度",
  summary: "CPU 一次只能服务一个进程，系统需要决定多个就绪进程先服务谁。",
  estimatedMinutes: 45,
  knowledgePointCount: 6,
  segmentCount: 6,
  knowledgePoints: [
    "调度是什么", "三级调度", "调度评价指标",
    "FCFS 与 SJF", "抢占式与非抢占式", "时间片轮转与多级反馈队列"
  ],
  /* 起止秒数是整条视频上的时间段，对应 lesson-data/segments/*.json 的
     source.position（后端那边目前也是占位值，等视频接入再对齐） */
  segments: [
    { segmentId: "seg-001", title: "调度是什么、为什么需要调度",   order: 1, startSeconds: 750,  endSeconds: 1080 },
    { segmentId: "seg-002", title: "三级调度：高级、中级、低级",   order: 2, startSeconds: 1080, endSeconds: 1410 },
    { segmentId: "seg-003", title: "调度评价指标",                 order: 3, startSeconds: 1410, endSeconds: 1740 },
    { segmentId: "seg-004", title: "FCFS 与 SJF",                 order: 4, startSeconds: 1740, endSeconds: 2070 },
    { segmentId: "seg-005", title: "抢占式与非抢占式",             order: 5, startSeconds: 2070, endSeconds: 2400 },
    { segmentId: "seg-006", title: "时间片轮转与多级反馈队列",     order: 6, startSeconds: 2400, endSeconds: 2700 }
  ]
};

/* 后端目前只配了这一节课（lesson-data/lesson-plan.json），
   所以目录里就只有它。真实选课应由后端下发，届时把这个函数换成请求即可。 */
export function fetchStudentCourses() {
  return Promise.resolve([{
    courseId: "operating-systems",
    name: "操作系统",
    summary: "从进程与资源管理出发，理解计算机如何协调多个任务。",
    icon: "⌘",
    currentWeek: 3,
    lessons: [{
      lessonId: LESSON_ID,
      week: 3,
      chapter: "第 3 周",
      title: LESSON.title,
      summary: LESSON.summary,
      /* 后端允许随时开课（/start 幂等，已结束的会话也能恢复），
         所以不按日历推断「已上过 / 未上过」，一律可进。 */
      status: "current",
      estimatedMinutes: LESSON.estimatedMinutes,
      knowledgePoints: LESSON.knowledgePoints
    }]
  }]);
}

export function fetchLesson(lessonId) {
  if (lessonId && lessonId !== LESSON_ID) {
    return Promise.reject(new Error("这节课尚未开放：" + lessonId));
  }
  return Promise.resolve(LESSON);
}


/* ═══════════════════════════════════════════════════════════
   ② 会话

   前端按课时生成一个 id 存进 localStorage，**直接当后端的 session_id 用**
   （后端 /start 接受任意 id，cls- 前缀只在它自己生成时才用）。
   两边共用同一个 id，课后报告才取得到同一节课的数据。
   ═══════════════════════════════════════════════════════════ */

/* POST /api/session/start
   ← { session_id, lesson_id, time_scale }   （student_id 后端默认 student-001）
   → { session_id, status, phase, available_actions, reply_text }

   幂等：同一个 session_id 重复调不会重新开课。
   注意 start **不会**自动上课，课要等 /begin。
   time_scale > 1 压缩课时（演练用，45 分钟压成几分钟），正式上课别传。 */
export function startSession(payload) {
  return request("POST", "/api/session/start", {
    session_id: payload.sessionId,
    lesson_id: payload.lessonId || LESSON_ID,
    time_scale: payload.timeScale || 1
  });
}

/* GET /api/session/{sid}/state
   → { status: idle|running|ended,
       phase, phase_name, stage_elapsed_minutes, stage_budget_minutes,
       lesson_elapsed_minutes, total_minutes, current_question,
       stars: { "KP-001": 3 }, segment_cursor, segment_total,
       remaining_stages, next_stage, available_actions, ... }

   ⚠️ stars 是裸的 {kp_id: 星级}，只有内部编号，没有标题 ——
      要给学生看带名字的星级请用 fetchLessonStars()。 */
export function fetchSessionState(sessionId) {
  return request("GET", "/api/session/" + encodeURIComponent(sessionId) + "/state");
}

/* GET /api/session/{sid}/messages?since=N
   → { messages: [{ seq, role: student|teacher, text, at, phase, llm }],
       total, student_id }

   since 传上次拿到的 total。**AI 主动说的话（心跳推的）也在这条里**，
   所以轮询这一个接口就能把对话画完整。 */
export function fetchSessionMessages(sessionId, since) {
  return request("GET", "/api/session/" + encodeURIComponent(sessionId) +
    "/messages?since=" + (since || 0));
}


/* ═══════════════════════════════════════════════════════════
   ③ 发言与老师动作

   学生发言和老师按钮都只是「推进一轮」，返回的 reply_text 已经在
   /messages 里了 —— 别拿它渲染（见文件头第 1 条）。
   ═══════════════════════════════════════════════════════════ */

/* POST /api/session/{sid}/message
   ← { text }
   → { reply_text, phase, phase_name, status, available_actions }
   课没开始时返回 409。 */
export function sendStudentMessage(sessionId, text) {
  return request("POST", "/api/session/" + encodeURIComponent(sessionId) + "/message", {
    text: text
  });
}

/* 三个老师按钮。前端照 available_actions 决定能不能按，不要自己猜：
     begin       —— 起课铃，只会成功一次，再来报 409
     media/done  —— 整段教学视频全片播完报一次（本课是 video 讲解模式）
     stage/next  —— 下一环节，无条件切幕，不受时间和证据门槛限制
   → { reply_text, phase, phase_name, status, available_actions } */
export var TEACHER_ACTIONS = {
  begin: "/begin",
  media_done: "/media/done",
  next_stage: "/stage/next"
};

export function sendTeacherAction(sessionId, action) {
  var path = TEACHER_ACTIONS[action];
  if (!path) return Promise.reject(new Error("未知的老师动作：" + action));
  return request("POST", "/api/session/" + encodeURIComponent(sessionId) + path);
}


/* ═══════════════════════════════════════════════════════════
   ④ 掌握度（按知识点，带标题）

   GET /api/session/{sid}/stars
   → { knowledge_points: [{ kp_id, title, stars, status }] }

   形状与 /export 里的 knowledge_points 一致。课堂上每几秒轮询一次，
   用于显示「答完这题，哪个知识点的星级动了」。
   ═══════════════════════════════════════════════════════════ */

/* 0–5 星标签。口径取自后端 rules/interaction/MASTERY-STAR-RULES.md
   （那份文件自称唯一权威规则）。这里不重算星级，只是标签查表：
   后端的 STAR_STATUS 缺 0 和 5 两个键，5 星会被它报成「未检测」。 */
export var STAR_LABELS = {
  0: "未检测",
  1: "已接触",
  2: "初步理解",
  3: "理解中",
  4: "接近掌握",
  5: "已掌握"
};

export function fetchLessonStars(sessionId) {
  return request("GET", "/api/session/" + encodeURIComponent(sessionId) + "/stars")
    .then(function (r) { return r.knowledge_points || []; });
}


/* ═══════════════════════════════════════════════════════════
   ⑤ 课后学情报告

   GET /api/session/{sid}/export?fmt=json
   → { student_id, lesson_id, session_id, lesson_elapsed_minutes,
       knowledge_points: [{ kp_id, title, stars, status }],
       stage_snapshots:  [{ stage, stage_elapsed_minutes,
                            targets_closed, targets_open, occurred_at, ... }] }

   ⚠️ 与其它接口不同，这个响应**没有 { ok } 信封**，直接返回整个对象。
      响应头还带 Content-Disposition: attachment（它是按「下载」设计的），
      fetch 仍能读到 body。报告只在课结束后才有内容。
   ═══════════════════════════════════════════════════════════ */

/* 后端 md 分支用的「理解线」：星级 <= 2 视为没达标 */
export var REPORT_WEAK_STARS = 2;

export function fetchLessonReport(sessionId) {
  return request("GET", "/api/session/" + encodeURIComponent(sessionId) + "/export?fmt=json");
}
