/* ═══════════════════════════════════════════════════════════
   阶段 2「总结复述」
   写作区 → 提交 → AI 结构化反馈（讲对的 / 遗漏的 / 补充 / 关联）
   ═══════════════════════════════════════════════════════════ */

import { $, el, renderInline, replayEntryAnimation } from "./ui.js";
import { reviewSummary } from "./api.js";

/* 引导问题：点一下插入到文本框，给写不出来的学生一个抓手。
   内容对应 KNOWLEDGE-BASE.md 里各知识点的「检测问题」 */
var PROMPTS = [
  "调度要解决什么问题？",
  "三级调度分别管什么？",
  "评价调度好坏看哪些指标？",
  "FCFS 和 SJF 差在哪？",
  "抢占式和非抢占式怎么区分？"
];

var MAX_LEN = 600;

export function createStage(ctx) {

  var pane = $("stage-summary");
  var writeView = $("summary-write");
  var reviewView = $("summary-review");
  var prompts = $("summary-prompts");
  var input = $("summary-input");
  var count = $("summary-count");
  var submitBtn = $("summary-submit");
  var nextBtn = $("summary-next");

  var submitted = false;   /* 本次进入是否已提交过 */

  /* ── 引导问题 chips ──────────────────────────────────── */

  function buildPrompts() {
    prompts.innerHTML = "";
    PROMPTS.forEach(function (text) {
      var chip = el("button", "prompt-chip", text);
      chip.type = "button";
      chip.addEventListener("click", function () { insertPrompt(text); });
      prompts.appendChild(chip);
    });
  }

  /* 插入到光标处；没有光标就追加到末尾 */
  function insertPrompt(text) {
    if (input.disabled) return;

    var start = input.selectionStart;
    var end = input.selectionEnd;
    var value = input.value;

    if (start == null || (start === 0 && end === 0 && value === "")) {
      input.value = text + "：\n";
    } else {
      var before = value.slice(0, start);
      var after = value.slice(end);
      var glue = before && !/\n$/.test(before) ? "\n" : "";
      input.value = before + glue + text + "：\n" + after;
    }

    input.focus();
    updateCount();
  }

  function updateCount() {
    var len = input.value.length;
    count.textContent = len + " / " + MAX_LEN;
    count.classList.toggle("is-near", len > MAX_LEN * 0.85);
    submitBtn.disabled = len < 10;
  }

  /* ── 提交 ────────────────────────────────────────────── */

  function submit() {
    var text = input.value.trim();
    if (text.length < 10) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "AI 正在看…";

    reviewSummary({
      sessionId: ctx.sessionId,
      lessonId: ctx.lessonId,
      segmentId: "seg-001",
      text: text
    }).then(function (res) {
      submitted = true;
      renderReview(res.review);
      writeView.hidden = true;
      reviewView.hidden = false;
      replayEntryAnimation(reviewView);
      ctx.rail.setPhase("总结复述");
    }).catch(function (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "提交给 AI 看";
      ctx.toast("提交失败：" + err.message);
    });
  }

  /* ── 反馈渲染 ────────────────────────────────────────── */

  function renderGroup(kind, label, items) {
    if (!items || !items.length) return null;

    var box = el("div", "fb fb--" + kind);
    box.appendChild(el("p", "fb__label", label));

    var list = el("ul", "fb__list");
    items.forEach(function (text) {
      /* 后端可能返回含 **粗体** 的文本，统一走 renderInline */
      var li = el("li");
      li.innerHTML = renderInline(text);
      list.appendChild(li);
    });
    box.appendChild(list);

    return box;
  }

  function renderConnections(items) {
    if (!items || !items.length) return null;

    var box = el("div", "fb fb--link");
    box.appendChild(el("p", "fb__label", "和以前内容的关联"));

    var list = el("ul", "fb__list");
    items.forEach(function (item) {
      var li = el("li");
      li.appendChild(el("span", "fb__lesson", item.lesson));
      var note = el("span");
      note.innerHTML = renderInline(item.note);
      li.appendChild(note);
      list.appendChild(li);
    });
    box.appendChild(list);

    return box;
  }

  function renderReview(review) {
    var body = $("summary-review-body");
    body.innerHTML = "";

    [
      renderGroup("good", "你讲对的", review.strengths),
      renderGroup("gap", "遗漏的", review.gaps),
      renderGroup("add", "补充", review.supplements),
      renderConnections(review.connections)
    ].forEach(function (node) {
      if (node) body.appendChild(node);
    });
  }

  /* 回到写作态（重新写一版） */
  function backToWrite() {
    reviewView.hidden = true;
    writeView.hidden = false;
    replayEntryAnimation(writeView);
    submitBtn.disabled = false;
    submitBtn.textContent = "重新提交";
  }

  /* ── 对外接口 ────────────────────────────────────────── */

  return {
    mount: function () {
      buildPrompts();

      input.maxLength = MAX_LEN;
      input.addEventListener("input", updateCount);
      submitBtn.addEventListener("click", submit);

      $("summary-revise").addEventListener("click", backToWrite);
      nextBtn.addEventListener("click", function () { ctx.advance("reflect"); });

      updateCount();
    },

    enter: function () {
      ctx.rail.setPhase("总结复述");

      /* 已提交过就停在反馈，否则回到写作态 */
      if (submitted) {
        writeView.hidden = true;
        reviewView.hidden = false;
      } else {
        writeView.hidden = false;
        reviewView.hidden = true;
        setTimeout(function () { input.focus(); }, 260);
      }
      replayEntryAnimation(pane);
    },

    leave: function () {},

    /* 换课：清空写的总结与已有反馈 */
    reset: function () {
      input.value = "";
      submitted = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "提交给 AI 看";
      $("summary-review-body").innerHTML = "";
      writeView.hidden = false;
      reviewView.hidden = true;
      updateCount();
    }
  };
}
