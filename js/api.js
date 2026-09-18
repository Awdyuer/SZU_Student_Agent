/* ═══════════════════════════════════════════════════════════
   预留接口层
   ───────────────────────────────────────────────────────────
   后端就绪后把 USE_MOCK 置为 false，下面每个函数即走真实请求。
   每个接口的请求/响应契约都写在函数上方的注释里。
   ═══════════════════════════════════════════════════════════ */

import { delay } from "./ui.js";

/* 后端就绪后置为 false */
export var USE_MOCK = true;


/* ── 请求辅助 ────────────────────────────────────────────── */

function request(method, url, body) {
  var options = { method: method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  return fetch(url, options).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}


/* ═══════════════════════════════════════════════════════════
   ① 课程信息
   GET /api/lesson?lessonId=ch3-process-scheduling
   → { ok, lesson: { lessonId, course, chapter, title, summary,
                     knowledgePointCount, segmentCount, estimatedMinutes,
                     knowledgePoints: [string],
                     segments: [{ segmentId, title, order,
                                  startSeconds, endSeconds }] } }

   目前只有一节课，前端不提供选课。将来接多门课时再加「课程列表」
   这一层；接口契约见文件末尾的注释。
   ═══════════════════════════════════════════════════════════ */

export var LESSON_ID = "ch3-process-scheduling";

/* 内容取自 class agent/KNOWLEDGE-BASE.md */
var MOCK_LESSON = {
  lessonId: LESSON_ID,
  course: "操作系统",
  chapter: "第 3 章",
  title: "处理机调度",
  summary: "CPU 一次只能服务一个进程，系统需要决定多个就绪进程先服务谁。",
  knowledgePointCount: 6,
  segmentCount: 6,
  estimatedMinutes: 45,
  knowledgePoints: [
    "调度是什么", "三级调度", "调度评价指标",
    "FCFS 与 SJF", "抢占式与非抢占式", "时间片轮转与多级反馈队列"
  ],
  /* 起止秒数对应整条教学视频上的时间段，
     来源是各 segment 的 source.position（当前还是占位值） */
  segments: [
    { segmentId: "seg-001", title: "调度是什么、为什么需要调度", order: 1, startSeconds: 750,  endSeconds: 1080 },
    { segmentId: "seg-002", title: "三级调度",                 order: 2, startSeconds: 1080, endSeconds: 1410 },
    { segmentId: "seg-003", title: "调度评价指标",             order: 3, startSeconds: 1410, endSeconds: 1740 },
    { segmentId: "seg-004", title: "FCFS 与 SJF",             order: 4, startSeconds: 1740, endSeconds: 2070 },
    { segmentId: "seg-005", title: "抢占式与非抢占式",         order: 5, startSeconds: 2070, endSeconds: 2400 },
    { segmentId: "seg-006", title: "时间片轮转与多级反馈队列", order: 6, startSeconds: 2400, endSeconds: 2700 }
  ]
};

export function fetchLesson(lessonId) {
  if (USE_MOCK) {
    return delay(320).then(function () {
      if (lessonId && lessonId !== LESSON_ID) throw new Error("没有这节课：" + lessonId);
      return MOCK_LESSON;
    });
  }
  return request("GET", "/api/lesson?lessonId=" + encodeURIComponent(lessonId || LESSON_ID))
    .then(function (r) { return r.lesson; });
}

/* ═══════════════════════════════════════════════════════════
   ② AI 对话
   POST /api/chat
   ← { sessionId, lessonId, message }
   → { ok, message: { text, speech }, hostPhase, introComplete }

   ⚠️ 现有后端只返回 { ok, message: { text, speech } }。
      前端还需要两个字段，需要后端补：
      · hostPhase     —— 驱动 4 阶段进度轨（后端已有该状态，只是没下发）
      · introComplete —— 课程介绍讲完，该切视频了
   ═══════════════════════════════════════════════════════════ */

export function sendChat(payload) {
  if (USE_MOCK) {
    return delay(700).then(function () {
      return {
        ok: true,
        message: { text: "记下了。等这段讲完我们一起处理 👌", speech: "" },
        hostPhase: "intro",
        introComplete: false
      };
    });
  }
  return request("POST", "/api/chat", payload);
}

/* 课程介绍的开场白 —— 内容取自 class agent/KNOWLEDGE-BASE.md */
export var MOCK_INTRO = [
  "你好！我是这节课的 AI 老师。\n今天我们一起学 **第 3 章 处理机调度**。",
  "先说这节课要解决什么问题——\nCPU 一次只能运行一个进程，但系统里常常同时有很多进程想运行。" +
  "**先让谁用 CPU、让多久、什么时候打断、什么时候切换**，管理这套规则就是处理机调度。",
  "这节课有 **6 个知识点**：\n调度是什么 · 三级调度 · 调度评价指标 · FCFS 与 SJF · " +
  "抢占式与非抢占式 · 时间片轮转与多级反馈队列。",
  "上课方式是这样：**先看一段教学视频**，然后我们按 4 个阶段走——\n" +
  "引导学习 → 总结复述 → 深入思考 → 课堂讨论。",
  "准备好了吗？下面开始播放教学视频。"
];


/* ═══════════════════════════════════════════════════════════
   ③ 老师端生成的教学视频
   GET /api/lesson/video?lessonId=ch3-process-scheduling
   → { ok, video: { url, poster, duration, title, source } }

   整节课**一条**视频，segment.startSeconds 是它上面的时间段。
   教师端 openmaic 有 /api/export-video/* 能力，
   学生端届时经平台接口取已发布的成片地址。
   ═══════════════════════════════════════════════════════════ */

export function fetchLessonVideo(lessonId) {
  if (USE_MOCK) {
    return delay(320).then(function () {
      return null;   /* 尚未接入 → 页面显示占位 */
    });
  }
  return request("GET", "/api/lesson/video?lessonId=" + encodeURIComponent(lessonId))
    .then(function (r) { return r.video; });
}


/* ═══════════════════════════════════════════════════════════
   ④ 阶段推进
   POST /api/phase/advance
   ← { sessionId, lessonId, from }
   → { ok, hostPhase }

   ⚠️ 后端当前有一个已知缺口：/段落结束 不会把 host_phase 置为
      segment_summary（文档记录「实测进度会卡在 lecturing」），
      不修则永远进不到阶段 2 及以后。
   ═══════════════════════════════════════════════════════════ */

export function advancePhase(payload) {
  if (USE_MOCK) {
    return delay(400).then(function () { return { ok: true, hostPhase: payload.from }; });
  }
  return request("POST", "/api/phase/advance", payload);
}


/* ═══════════════════════════════════════════════════════════
   ⑤ 阶段 2：提交复述，拿结构化反馈
   POST /api/summary/review
   ← { sessionId, lessonId, segmentId, text }
   → { ok, review: {
         strengths:   [string],                 // 讲对的
         gaps:        [string],                 // 遗漏的
         supplements: [string],                 // 补充
         connections: [{ lesson, note }]        // 和以前内容的关联
       } }

   ⚠️ 后端当前**没有这个能力**。后端的 segment_summary 阶段里
      学生只做「选一个标记点」，不写复述，也没有「遗漏/补充/
      关联」任何字段（grep 遗漏 → 0 命中）。需要后端新增。
   ═══════════════════════════════════════════════════════════ */

export function reviewSummary(payload) {
  if (USE_MOCK) {
    return delay(1400).then(function () {
      return {
        ok: true,
        review: {
          strengths: [
            "你抓住了核心矛盾：CPU 一次只能服务一个进程，所以必须有一套规则决定谁先用。",
            "提到「让多久」和「什么时候切换」，这两点确实是调度要管的，不是只选一个就完事。"
          ],
          gaps: [
            "没有提到三级调度的区分——高级调度管作业进内存，低级调度才是在就绪进程里挑一个上 CPU。这两个容易混。",
            "调度评价指标（周转时间、等待时间、响应时间）完全没提，后面的算法比较都要用它们。"
          ],
          supplements: [
            "补一点：调度不只是「选谁」，还包括「选中后能占用多久」和「什么时候强行收回」——" +
            "后两者由抢占规则和时间片共同决定。你写的「什么时候切换」其实已经碰到这一层了。"
          ],
          connections: [
            { lesson: "第 2 章 进程管理", note: "进程五状态里「就绪 → 运行」这一步，正是由低级调度完成的。" },
            { lesson: "第 1 章 操作系统概述", note: "当时说 OS 是「资源管理者」，调度就是它对 CPU 这个资源最直接的分配手段。" }
          ]
        }
      };
    });
  }
  return request("POST", "/api/summary/review", payload);
}


/* ═══════════════════════════════════════════════════════════
   ⑥ 阶段 3：提交思考，拿点评
   POST /api/reflection
   ← { sessionId, lessonId, lens, answer }   // lens: logic | application | transfer
   → { ok, critique: { verdict, comment, followUp } }

   ⚠️ 后端当前**没有这个能力**。后端的 point_review 阶段完全等同
      于「标记点答疑」，没有「为什么/如何」「实际问题」「跨学科
      关联」任何字段（grep 跨学科 → 0 命中，grep 实际问题 → 0 命中）。
   ═══════════════════════════════════════════════════════════ */

/* 三个视角的题目 —— 内容对应 KNOWLEDGE-BASE.md 里各知识点的「检测问题」 */
export var REFLECTION_LENSES = [
  {
    key: "logic",
    name: "底层逻辑",
    question: "为什么要调度，而不是让每个进程一直运行到结束？",
    hint: "想想「为什么」和「如何」——如果不调度，会发生什么？"
  },
  {
    key: "application",
    name: "实际问题",
    question: "这套调度机制，能解决现实中的哪些问题？",
    hint: "可以从你用过的东西想：手机切应用、服务器同时处理很多请求……"
  },
  {
    key: "transfer",
    name: "跨学科关联",
    question: "它和其他学科有什么关联？",
    hint: "排队论、概率统计、经济学里的资源分配……有没有相通的地方？"
  }
];

var MOCK_CRITIQUES = {
  logic: {
    verdict: "good",
    comment: "方向对了。「不能一直运行到结束」是关键——因为进程会等 I/O，如果霸占 CPU 等，" +
             "整台机器的利用率就掉下去了。调度的本质是**在多个等待者之间分配稀缺资源**，" +
             "而且这个分配还得考虑「这次分出去多久能收回来」。",
    followUp: "如果 CPU 有 8 个核心，调度还需要吗？需要的话，问题变成了什么？"
  },
  application: {
    verdict: "good",
    comment: "举的例子里「手机切应用」很贴切——你滑动屏幕时希望立刻响应，" +
             "这就是调度在保交互式任务的响应时间。\n服务器场景则是另一个侧重：那里更在意**吞吐量**，" +
             "关心单位时间能处理完多少请求，而不是单个请求有多快。",
    followUp: "这两类任务的诉求是冲突的——交互要「快」，批处理要「多」。你觉得该用同一套算法吗？"
  },
  transfer: {
    verdict: "partial",
    comment: "提到「排队」已经很接近了。操作系统调度和**排队论**是同一个数学骨架：" +
             "都是「顾客到达 → 排队 → 接受服务」，只是把顾客换成了进程。\n" +
             "更有意思的是经济学：调度算法里的「饥饿」（长作业一直排不上）" +
             "本质就是资源分配中的**公平 vs 效率**权衡。",
    followUp: "如果让你用一句话说明「公平和效率为什么常常冲突」，你会怎么说？"
  }
};

export function submitReflection(payload) {
  if (USE_MOCK) {
    return delay(1200).then(function () {
      return { ok: true, critique: MOCK_CRITIQUES[payload.lens] || MOCK_CRITIQUES.logic };
    });
  }
  return request("POST", "/api/reflection", payload);
}


/* ═══════════════════════════════════════════════════════════
   ⑦ 阶段 4：课堂讨论
   GET  /api/discussion?lessonId=
   → { ok, topic, messages: [{ id, speaker, name, text, at }] }
                            // speaker: host | peer | me
   POST /api/discussion
   ← { sessionId, lessonId, text }
   → { ok, message }

   ⚠️ 后端当前**完全没有多人结构**：student_id 全链路硬编码
      student-001，数据库草案里没有班级/花名册/讨论组任何表，
      classroom_event 的 actor 只允许 host/platform/system。
      老师与同学的发言都需要后端新增，这里先 mock。
   ═══════════════════════════════════════════════════════════ */

var MOCK_DISCUSSION = {
  topic: "如果你是操作系统设计者，面对「交互式任务和批处理任务混跑」的场景，" +
         "你会怎么选调度算法？说说你的理由。",
  messages: [
    { id: "d1", speaker: "host", name: "老师",
      text: "同学们，我们来看一个问题 —— 交互式任务（比如你正在点的窗口）和批处理任务（比如后台跑的编译）" +
            "混在一起，你会怎么选调度算法？为什么？",
      at: "14:32" },
    { id: "d2", speaker: "peer", name: "林知遥",
      text: "我会选时间片轮转。交互式任务要的是响应快，等太久用户就感觉卡了，" +
            "时间片能让每个任务都定期拿到 CPU。",
      at: "14:33" },
    { id: "d3", speaker: "peer", name: "陈嘉树",
      text: "但全用时间片轮转的话，批处理任务会被切得很碎，切换本身也是开销，" +
            "吞吐量会掉下来。我倾向多级反馈队列——它能让短任务和交互任务优先级更高。",
      at: "14:34" },
    { id: "d4", speaker: "host", name: "老师",
      text: "嘉树提到的多级反馈队列很关键。那追问一句 —— 为什么它「不需要预先知道进程要跑多久」，" +
            "这一点为什么重要？",
      at: "14:35" }
  ]
};

/* 老师对第一位发言学生的追问 —— mock，
   真实场景应由后端推送的讨论流给出 */
export var MOCK_TEACHER_FOLLOWUP =
  "这个角度不错，而且你已经开始考虑「任务的类型」了 —— 这正是问题的关键。" +
  "那你觉得，如果系统**不知道**一个任务要跑多久（现实中大多如此），" +
  "前面说的那些算法还剩几个能用？";

export function fetchDiscussion(lessonId) {
  if (USE_MOCK) {
    return delay(420).then(function () { return MOCK_DISCUSSION; });
  }
  return request("GET", "/api/discussion?lessonId=" + encodeURIComponent(lessonId))
    .then(function (r) { return { topic: r.topic, messages: r.messages }; });
}

export function postDiscussion(payload) {
  if (USE_MOCK) {
    return delay(520).then(function () {
      return {
        ok: true,
        message: {
          id: "me-" + Date.now(),
          speaker: "me",
          name: "我",
          text: payload.text,
          at: new Date().toTimeString().slice(0, 5)
        }
      };
    });
  }
  return request("POST", "/api/discussion", payload);
}

/* 老师宣布讨论结束（预留：真实场景由平台事件推送，而非前端请求） */
export function fetchDiscussionEnd(lessonId) {
  if (USE_MOCK) {
    return delay(2600).then(function () {
      return {
        ok: true,
        closing: "时间到了，今天就到这里。刚才讨论里「公平 vs 效率」这个矛盾，" +
                 "大家在课后可以继续想 —— 它不只出现在操作系统里。"
      };
    });
  }
  return request("GET", "/api/discussion/end?lessonId=" + encodeURIComponent(lessonId))
    .then(function (r) { return r.closing; });
}


/* ═══════════════════════════════════════════════════════════
   将来接多门课时要补的接口 —— 现在不实现，先记着契约

   GET /api/courses
   → { ok, courses: [{
         courseId, name, summary,
         lessonCount, completedLessonCount,
         status: 'not_started' | 'in_progress' | 'completed',
         currentLessonId, currentLessonTitle,     // 当前要上的那一节
         progress: { completedPhases, masteryAvg, lastActiveAt }
       }] }

   GET /api/courses/<courseId>
   → { ok, course: { ...同上... } }

   GET /api/courses/<courseId>/lessons
   → { ok, lessons: [{
         lessonId, chapter, title, summary,
         knowledgePointCount, segmentCount, estimatedMinutes,
         status, progress: { currentStage, completedPhases, masteryAvg }
       }] }

   加上这三个之后，初始界面就可以从「课堂 / 课后 两个按钮」
   扩成「选课程 → 课堂 / 课后」的两级结构。
   ═══════════════════════════════════════════════════════════ */
