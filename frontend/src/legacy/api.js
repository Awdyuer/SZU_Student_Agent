/* 学生端 API：一个 AI 消息入口，阶段由后端会话状态决定。 */

var API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

function request(method, url, body) {
  var options = { method: method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  return fetch(API_BASE_URL + url, options).then(async function (res) {
    var data = null;
    try { data = await res.json(); } catch (error) { /* 空响应 */ }
    if (!res.ok) {
      var detail = data && data.detail ? data.detail : "HTTP " + res.status;
      var failure = new Error(detail);
      failure.status = res.status;
      throw failure;
    }
    return data || {};
  });
}

function sessionUrl(sessionId, suffix) {
  return "/api/session/" + encodeURIComponent(sessionId) + (suffix || "");
}

export function normalizeTurn(result) {
  return {
    ok: result.ok !== false,
    message: { text: result.reply_text || "", speech: "" },
    hostPhase: result.phase || null,
    phaseName: result.phase_name || "",
    status: result.status,
    currentQuestion: result.current_question || null,
    stars: result.stars || {},
    total: typeof result.total === "number" ? result.total : null,
    availableActions: result.available_actions || []
  };
}

export function fetchStudentCourses() {
  return request("GET", "/api/student/courses").then(function (r) { return r.courses || []; });
}

export function fetchLesson(lessonId) {
  return request("GET", "/api/lesson?lessonId=" + encodeURIComponent(lessonId))
    .then(function (r) { return r.lesson; });
}

export function fetchLessonVideo(lessonId) {
  return request("GET", "/api/lesson/video?lessonId=" + encodeURIComponent(lessonId))
    .then(function (r) { return r.video || null; });
}

/* 登录后的学生身份（StudentLogin 存进 localStorage）。
   取不到就沿用旧的兜底值 —— 后端没配名单时登录页本来就会放行。 */
function currentStudentId() {
  try {
    var raw = window.localStorage.getItem("ai-learn.student");
    var student = raw ? JSON.parse(raw) : null;
    return student && student.studentId ? student.studentId : "";
  } catch (error) {
    return "";
  }
}

export function startSession(payload) {
  return request("POST", "/api/session/start", {
    session_id: payload.sessionId,
    student_id: payload.studentId || currentStudentId() || "student-001",
    lesson_id: payload.lessonId,
    time_scale: payload.timeScale || 1
  }).then(normalizeTurn);
}

export function beginSession(sessionId) {
  return request("POST", sessionUrl(sessionId, "/begin")).then(normalizeTurn);
}

export function sendMessage(sessionId, text) {
  return request("POST", sessionUrl(sessionId, "/message"), { text: text })
    .then(normalizeTurn);
}

export function notifyMediaDone(sessionId) {
  return request("POST", sessionUrl(sessionId, "/media/done"), {})
    .then(normalizeTurn);
}

export function advanceStage(sessionId) {
  return request("POST", sessionUrl(sessionId, "/stage/next"), {})
    .then(normalizeTurn);
}

export function fetchSessionState(sessionId) {
  return request("GET", sessionUrl(sessionId, "/state")).then(function (state) {
    return {
      ...state,
      hostPhase: state.phase,
      currentQuestion: state.current_question,
      availableActions: state.available_actions || []
    };
  });
}

export function fetchSessionMessages(sessionId, since) {
  return request("GET", sessionUrl(sessionId, "/messages?since=" + (since || 0)));
}

/* 0–5 星标签。口径取自后端 rules/interaction/MASTERY-STAR-RULES.md，
   那份文件自称「唯一权威规则，任何页面不得另算一套」——
   这里不重算星级，只是补一张标签查表：后端决定星级的 STAR_STATUS 缺少
   0 和 5 两个键，5 星会被它报成「未检测」，所以要拿这张表兜底。 */
export var STAR_LABELS = {
  0: "未检测",
  1: "已接触",
  2: "初步理解",
  3: "理解中",
  4: "接近掌握",
  5: "已掌握"
};

/* 后端 md 分支用的「理解线」：星级 <= 2 视为没达标 */
export var REPORT_WEAK_STARS = 2;

/* 课后学情报告。响应是**裸 JSON，没有 { ok } 信封**（与本文件其它接口不同），
   别去拆 r.report —— request() 直接返回整个响应对象。
   sessionId 用后端自己下发的那个（形如 cls-xxxx，来自 startSession），
   不是 app.js 存在 localStorage 里按课时生成的那个 UUID。
   报告只在课已结束（status === "ended"）后才有内容。
   第二个参数 lessonId 只用于调用方语义，后端按会话取课时，不参与请求。 */
export function fetchLessonReport(sessionId) {
  return request("GET", sessionUrl(sessionId, "/export?fmt=json"));
}
