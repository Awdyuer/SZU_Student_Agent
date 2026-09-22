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

export function startSession(payload) {
  return request("POST", "/api/session/start", {
    session_id: payload.sessionId,
    student_id: payload.studentId || "student-001",
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

export function fetchLearningReport(sessionId) {
  return request("GET", sessionUrl(sessionId, "/export?fmt=json"));
}
