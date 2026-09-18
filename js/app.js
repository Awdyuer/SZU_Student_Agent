/* ═══════════════════════════════════════════════════════════
   AI 学习空间 —— 编排层
   ├─ 路由：入口 / 课堂 / 课后
   └─ 课堂阶段状态机（7 个 stage）+ 过渡动效调度

   目前只有一节课，所以不提供选课。将来接多门课时再加「课程列表」
   这一层，接口契约见 api.js 末尾。
   ═══════════════════════════════════════════════════════════ */

import {
  $, visibleRoot, waitForAnimation, replayEntryAnimation,
  reduceMotion, showToast
} from "./ui.js";

import { fetchLesson, LESSON_ID } from "./api.js";
import { createRail } from "./rail.js";
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

var sessionId = (window.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : "s-" + Date.now() + "-" + Math.random().toString(16).slice(2);

var currentLessonId = LESSON_ID;
var lesson = null;

var rail = null;
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

/* 切视图是异步的（要等退场动画）。用队列串起来，而不是用布尔标志
   把后来的请求丢掉 —— 丢掉会让「点课堂后立刻再点」直接卡住，
   因为第二次跳转被静默忽略，目标视图永远不会出现。 */
var viewChain = Promise.resolve();

function showView(targetId) {
  viewChain = viewChain.then(function () { return switchView(targetId); });
  return viewChain;
}

async function switchView(targetId) {
  var target = $(targetId);
  var current = visibleRoot();
  if (!target || current === target) return;

  if (current && !reduceMotion) {
    current.classList.add("is-leaving");
    await waitForAnimation(current, 320);
    current.classList.remove("is-leaving");
  }
  if (current) current.hidden = true;
  target.hidden = false;
  replayEntryAnimation(target);

  var heading = target.querySelector("h1, h2");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
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
   课堂阶段状态机

   idle → chat → video → summary → reflect → discuss → done
   （chat / video 同属「引导学习」阶段）
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

var PHASE_OF_STAGE = {
  idle: null,
  chat: "引导学习",
  video: "引导学习",
  summary: "总结复述",
  reflect: "深入思考",
  discuss: "课堂讨论",
  done: "课堂讨论"
};

var currentStage = "idle";
var stageSwitching = false;

var owners = {};
var classStage = null;    /* 课堂模块实例：idle/chat/video 三个子阶段共用 */
var reviewView = null;    /* 课后（内容待定） */

function ctxFor() {
  return {
    rail: rail,
    sessionId: sessionId,
    lessonId: currentLessonId,
    getLesson: function () { return lesson; },
    advance: advanceTo,
    toast: showToast,
    goHome: function () { go(""); }
  };
}

/* 立即切换（不含过渡动效）—— 初始化与深链恢复用 */
function setStage(name) {
  if (!PANE[name]) return;
  currentStage = name;

  Object.keys(PANE).forEach(function (key) {
    $(PANE[key]).hidden = key !== name;
  });

  if (name === "idle") {
    rail.hide();
    rail.setBadge(null);   /* 回课前要把上一轮留下的阶段徽标清掉 */
  } else {
    rail.show();
  }

  var owner = owners[name];
  if (owner && owner.enter) owner.enter(name);
}

/* 带动效地推进到下一个阶段 */
function advanceTo(name) {
  if (!PANE[name] || stageSwitching) return Promise.resolve();

  var prev = owners[currentStage];
  var next = owners[name];
  var phase = PHASE_OF_STAGE[name];
  var phaseChanged = PHASE_OF_STAGE[currentStage] !== phase;

  /* 离开旧模块（切模块才调，同一模块内部切换不调） */
  if (prev && prev !== next && prev.leave) prev.leave();

  /* 阶段没变就不播过渡遮罩。
     遮罩是用来宣告「进入新阶段」的；discuss 和 done 同属「课堂讨论」，
     再播一次会让人以为又被送回了讨论页。 */
  if (!phaseChanged) {
    setStage(name);
    return Promise.resolve();
  }

  stageSwitching = true;
  return rail.transitionTo(phase, function () {
    setStage(name);
  }).finally(function () {
    stageSwitching = false;
  });
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

rail = createRail();
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
