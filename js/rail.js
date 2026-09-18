/* ═══════════════════════════════════════════════════════════
   4 阶段进度轨 + 阶段过渡动效

   过渡时序（总 ~1.65s）：
     遮罩淡入 400ms → 进度轨推进 → 遮罩内文字切入 → 在遮罩下换内容
     → 停留 → 遮罩淡出 350ms
   全程遵守 prefers-reduced-motion：该模式下直接切换，不动画。
   ═══════════════════════════════════════════════════════════ */

import { $, delay, waitForAnimation, reduceMotion } from "./ui.js";

export var PHASES = ["引导学习", "总结复述", "深入思考", "课堂讨论"];

/* 过渡遮罩里每个阶段的一行说明 */
var PHASE_DESC = {
  "引导学习": "跟着 AI 老师，看视频、听讲解",
  "总结复述": "用你自己的话，把刚学的讲一遍",
  "深入思考": "问一问为什么、能解决什么、和别的学科有什么关系",
  "课堂讨论": "老师和同学们一起聊"
};

export function createRail() {
  var wrap = $("rail-wrap");
  var list = $("rail");
  var badge = $("class-badge");

  /* ── 进度轨 ──────────────────────────────────────────── */

  function indexOf(phase) {
    return PHASES.indexOf(phase);
  }

  /* 立即切换（无过渡遮罩）—— 用于初始化、深链恢复 */
  function setPhase(phase) {
    var current = indexOf(phase);
    if (current < 0) return;

    var steps = list.children;
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.toggle("is-done", i < current);
      steps[i].classList.toggle("is-current", i === current);
    }
    setBadge(phase);
  }

  /* 课程结束：四格全满，不留 current —— 否则最后一个阶段永远是「进行中」 */
  function completeAll() {
    var steps = list.children;
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.add("is-done");
      steps[i].classList.remove("is-current");
    }
  }

  function setBadge(text) {
    if (!badge) return;
    if (!text) {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    badge.textContent = text;
  }

  function show() { wrap.hidden = false; }
  function hide() { wrap.hidden = true; }

  /* ── 过渡遮罩 ────────────────────────────────────────── */

  var veil = $("phase-veil");
  var veilNum = $("veil-num");
  var veilTitle = $("veil-title");
  var veilDesc = $("veil-desc");

  function fillVeil(phase) {
    veilNum.textContent = String(indexOf(phase) + 1);
    veilTitle.textContent = phase;
    veilDesc.textContent = PHASE_DESC[phase] || "";
  }

  /* 在遮罩下把内容换掉，然后揭开。
     swapFn 应当是「切换 stage 内容」的函数；它的耗时会被遮罩盖住。 */
  async function transitionTo(phase, swapFn) {
    if (reduceMotion || !veil) {
      setPhase(phase);
      if (swapFn) await swapFn();
      return;
    }

    fillVeil(phase);
    veil.hidden = false;
    veil.classList.remove("is-leaving");
    veil.classList.add("is-entering");
    void veil.offsetWidth;            /* 强制回流，确保动画从头播 */
    await delay(250);                 /* 遮罩淡入 + 卡片浮起（动画 .26s） */

    setPhase(phase);                  /* 进度轨同时推进 */

    if (swapFn) await swapFn();       /* 内容在遮罩下完成切换 */

    await delay(380);                 /* 停留一拍，够读完阶段名 */
    veil.classList.remove("is-entering");
    veil.classList.add("is-leaving");
    await waitForAnimation(veil, 280);   /* 淡出动画 .22s，280 作兜底 */

    veil.classList.remove("is-leaving");
    veil.hidden = true;
  }

  return {
    setPhase: setPhase,
    completeAll: completeAll,
    setBadge: setBadge,
    show: show,
    hide: hide,
    transitionTo: transitionTo,
    PHASES: PHASES
  };
}
