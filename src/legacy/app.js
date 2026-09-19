/* ═══════════════════════════════════════════════════════════
   AI 学习空间 —— 编排层
   ├─ 路由：入口 / 课堂 / 课后
   └─ 界面跟随后端的 host_phase（见 ORCHESTRATOR.md）

   前端不决定演到哪一幕。每次拿到后端响应就读 host_phase，
   变了才切界面。所有界面的真值源在后端。

   目前只有一节课，所以不提供选课。将来接多门课时再加「课程列表」
   这一层，接口契约见 api.js 末尾。
   ═══════════════════════════════════════════════════════════ */

import { $, visibleRoot, showToast } from "./ui.js";

import { fetchLesson, sendChat, LESSON_ID } from "./api.js";
import { uiOf, labelOf, isKnown } from "./phases.js";
import { createThemeSwitch } from "./theme.js";
import { createStage as createClassStage } from "./stage-class.js";
import { createView as createReviewView } from "./view-review.js";
import { createStage as createSummaryStage } from "./stage-summary.js";
import { createStage as createReflectStage } from "./stage-reflect.js";
import { createStage as createDiscussStage } from "./stage-discuss.js";
import { createStage as createDoneStage } from "./stage-done.js";


/* ═══════════════════════════════════════════════════════════
   会话与课时
   ═══════════════════════════════════════════════════════════ */

/* sessionId 不能每次刷新都换新的 —— 它是后端 checkpointer 的
   thread_id（ORCHESTRATOR.md §7），换了就等于每次刷新后端都当新会话，
   上一轮的状态接不上。所以持久化。 */
var SESSION_KEY = "ai-learn.sessionId";

function loadSessionId() {
  try {
    var saved = localStorage.getItem(SESSION_KEY);
    if (saved) return saved;
  } catch (e) { /* 隐私模式下不可用 */ }

  var fresh = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : "s-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  try { localStorage.setItem(SESSION_KEY, fresh); } catch (e) { /* 忽略 */ }
  return fresh;
}

var sessionId = loadSessionId();

var currentLessonId = LESSON_ID;
var lesson = null;

/* 后端当前说的那一幕。null 表示还没跟后端对过话 */
var hostPhase = null;

var themeSwitch = null;


/* ═══════════════════════════════════════════════════════════
   路由

   #         → 入口（课堂 / 课后 两个按钮）
   #/class   → 课堂（4 阶段）
   #/review  → 课后（内容待定，先留空）
   ═══════════════════════════════════════════════════════════ */

var VIEWS = {
  class: "view-class",
  review: "view-review"
};

function parseHash() {
  var raw = location.hash.replace(/^#\/?/, "");
  if (!raw) return { name: "", id: "" };
  var parts = raw.split("/");
  return {
    name: parts[0],
    id: parts[1] ? decodeURIComponent(parts[1]) : ""
  };
}

function go(hash) {
  location.hash = hash;
}

function showView(targetId) {
  switchView(targetId);
}

function switchView(targetId) {
  var target = $(targetId);
  var current = visibleRoot();
  if (!target || current === target) return;

  if (current) current.hidden = true;
  target.hidden = false;

  var heading = target.querySelector("h1, h2");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderRoute() {
  var route = parseHash();

  /* 外观切换只在入口页显示 */
  if (themeSwitch) themeSwitch.setVisible(!route.name);

  if (!route.name) {
    showView("hub");
    return;
  }

  if (route.name === "class") {
    openLessonRoute();
    return;
  }

  if (route.name === "review") {
    showView(VIEWS.review);
    reviewView.enter();
    return;
  }

  /* 未知路由 → 回入口 */
  location.replace("#");
}


/* ═══════════════════════════════════════════════════════════
   课堂界面

   界面不自己排顺序 —— 后端说 host_phase 是哪一个，就显示对应界面。
   唯一的例外是 guided_learning 内部还有「对话 / 视频」两段，
   那是前端的局部状态（学生点「播放视频」进入，看完通知后端）。
   ═══════════════════════════════════════════════════════════ */

var PANE = {
  idle: "stage-idle",
  chat: "stage-chat",
  video: "stage-video",
  summary: "stage-summary",
  reflect: "stage-reflect",
  discuss: "stage-discuss",
  done: "stage-done"
};

var currentStage = "idle";

var owners = {};
var classStage = null;    /* 课堂模块实例：idle/chat/video 三个子阶段共用 */
var reviewView = null;    /* 课后（内容待定） */

/* 页头那枚状态胶囊 —— 进度轨删掉后，这是学生判断「现在在哪一步」
   的唯一依据，所以每一幕切换都要更新它。 */
function setStatus(text) {
  var badge = $("class-badge");
  if (!badge) return;
  if (!text) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.textContent = text;
}

function ctxFor() {
  return {
    sessionId: sessionId,
    lessonId: currentLessonId,
    getLesson: function () { return lesson; },
    getPhase: function () { return hostPhase; },
    /* 后端每轮返回后统一交给这里 —— 「完全跟随」的落点 */
    applyServerTurn: applyServerTurn,
    /* 各阶段模块更新页头状态（视频这类子状态用） */
    setStatus: setStatus,
    /* 课堂内部的局部切换（对话 ⇄ 视频），不经后端 */
    showStage: setStage,
    /* 给后端发一条控制消息（/继续、/下课 之类），响应统一按 host_phase 处理。
       「学生手动进入下一阶段」保留的就是这个 —— 但推进与否由后端判定。 */
    sendControl: function (text) {
      return sendChat({
        sessionId: sessionId,
        lessonId: currentLessonId,
        message: text,
        now: new Date().toISOString()
      }).then(function (res) {
        applyServerTurn(res);
        return res;
      });
    },
    toast: showToast,
    goHome: function () { go(""); }
  };
}

/* 立即切换界面。只改显示，不碰任何进度概念 */
function setStage(name) {
  if (!PANE[name]) return;
  currentStage = name;

  Object.keys(PANE).forEach(function (key) {
    var node = $(PANE[key]);
    if (node) node.hidden = key !== name;
  });

  /* 先按当前 host_phase 给个默认状态，owner.enter 可以覆盖成子状态 */
  setStatus(hostPhase ? labelOf(hostPhase) : "");

  var owner = owners[name];
  if (owner && owner.enter) owner.enter(name);
}

/* 后端每轮返回后统一处理。读 host_phase，变了才切界面。
   切幕由后端的 judge_advance 决定，前端不参与判断。 */
function applyServerTurn(res) {
  if (!res || !res.hostPhase) return;

  var phase = res.hostPhase;

  if (!isKnown(phase)) {
    console.warn("[app] 后端下发了不认识的 host_phase，已忽略：" + phase);
    return;
  }

  if (phase === hostPhase) return;      /* 没变，什么都不做 */

  hostPhase = phase;
  setStatus(labelOf(phase));

  var target = uiOf(phase);
  if (!target) return;

  /* 已经在目标界面了（比如视频是 guided_learning 的内部状态），
     只更新状态文字，别把学生正在看的视频打断 */
  if (target === currentStage) return;
  if (phase === "guided_learning" && currentStage === "video") return;

  setStage(target);
}

/* 去重：chat/video 和 idle 是同一个模块实例 */
function uniqueOwners() {
  var seen = [];
  Object.keys(owners).forEach(function (key) {
    var owner = owners[key];
    if (owner && seen.indexOf(owner) === -1) seen.push(owner);
  });
  return seen;
}

function resetClassroom() {
  uniqueOwners().forEach(function (owner) {
    if (owner.reset) owner.reset();
  });
  currentStage = "idle";
}


/* ═══════════════════════════════════════════════════════════
   进入课堂
   ═══════════════════════════════════════════════════════════ */

function openLessonRoute() {
  showView(VIEWS.class);

  if (lesson) {
    /* 再进来时保留进度，只恢复所处阶段 */
    setStage(currentStage);
    $("btn-start").disabled = false;
    return;
  }

  /* 先把「课前」摆出来，课程信息到了再填 */
  setStage("idle");
  $("btn-start").disabled = true;   /* 课程没到位不让开课 */

  fetchLesson(currentLessonId).then(function (data) {
    lesson = data;
    classStage.renderLesson(data);
    $("class-title").textContent = data.chapter + " " + data.title;
    $("done-sub").textContent = data.course + " · " + data.chapter + " " + data.title;
    $("btn-start").disabled = false;
  }).catch(function (err) {
    $("lesson-eyebrow").textContent = "课程";
    $("lesson-title").textContent = "载入失败";
    $("lesson-summary").textContent = err.message;
    $("lesson-note").textContent = "课程信息加载失败，请返回重试";
    showToast("课程载入失败：" + err.message);
  });
}


/* ═══════════════════════════════════════════════════════════
   事件绑定
   ═══════════════════════════════════════════════════════════ */

window.addEventListener("hashchange", renderRoute);

/* 入口的两张卡 */
document.querySelectorAll("[data-goto]").forEach(function (card) {
  card.addEventListener("click", function () {
    go(card.dataset.goto === "class" ? "#/class" : "#/review");
  });
});

/* 返回一律回入口 —— 层级只有两层，不需要按路由推导 */
document.querySelectorAll("[data-back]").forEach(function (btn) {
  btn.addEventListener("click", function () { go(""); });
});

/* Esc 等同于返回，但课堂里不生效 —— 课堂中不允许退出 */
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  var route = parseHash();
  if (!route.name || route.name === "class") return;
  go("");
});


/* ═══════════════════════════════════════════════════════════
   启动
   ═══════════════════════════════════════════════════════════ */

themeSwitch = createThemeSwitch();

var ctx = ctxFor();

classStage = createClassStage(ctx);
reviewView = createReviewView(ctx);

owners = {
  /* idle / chat / video 是同一个课堂模块的三个子阶段 */
  idle:    classStage,
  chat:    classStage,
  video:   classStage,
  summary: createSummaryStage(ctx),
  reflect: createReflectStage(ctx),
  discuss: createDiscussStage(ctx),
  done:    createDoneStage(ctx),
  review:  reviewView     /* 视图模块，只为统一 mount */
};

/* 每个模块只 mount 一次 */
uniqueOwners().forEach(function (owner) {
  if (owner && owner.mount) owner.mount();
});

/* 路由决定初始视图 */
renderRoute();
