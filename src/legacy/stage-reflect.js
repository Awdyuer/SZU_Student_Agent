/* ═══════════════════════════════════════════════════════════
   阶段 3「深入思考」
   三张卡片逐个展开：底层逻辑 → 实际问题 → 跨学科关联
   每张卡提交后展示 AI 点评，三张全部完成才能进入下一阶段
   ═══════════════════════════════════════════════════════════ */

import { $, el, renderInline, replayEntryAnimation } from "./ui.js";
import { REFLECTION_LENSES, submitReflection, CONTINUE_EVENT } from "./api.js";

/* verdict → 展示文案与配色 */
var VERDICT = {
  good:     { label: "答得不错",   tone: "good" },
  partial:  { label: "方向对了",   tone: "partial" },
  shallow:  { label: "可以再想想", tone: "shallow" }
};

export function createStage(ctx) {

  var pane = $("stage-reflect");
  var host = $("lens-list");
  var nextBtn = $("reflect-next");
  var hint = $("reflect-hint");

  var cards = [];          /* { lens, node, textarea, submit, body, critique, done } */
  var doneCount = 0;

  /* ── 建卡 ────────────────────────────────────────────── */

  function buildCards() {
    host.innerHTML = "";
    cards = [];
    doneCount = 0;

    REFLECTION_LENSES.forEach(function (lens, index) {
      cards.push(buildCard(lens, index));
    });

    layout();
  }

  function buildCard(lens, index) {
    var card = el("article", "lens");
    card.dataset.lens = lens.key;

    /* 头部：序号 + 名称 + 完成勾 */
    var head = el("header", "lens__head");
    head.appendChild(el("span", "lens__num", String(index + 1)));
    head.appendChild(el("span", "lens__name", lens.name));
    head.appendChild(el("span", "lens__mark", "✓"));
    card.appendChild(head);

    /* 主体：题干 + 提示 + 输入 + 提交 + 点评位 */
    var body = el("div", "lens__body");
    body.appendChild(el("p", "lens__q", lens.question));
    body.appendChild(el("p", "lens__hint", lens.hint));

    var textarea = el("textarea", "lens__input");
    textarea.rows = 3;
    textarea.placeholder = "写下你的想法，不用长，说到点上就行…";
    textarea.maxLength = 400;
    body.appendChild(textarea);

    var foot = el("div", "lens__foot");
    var submit = el("button", "btn btn--primary", "提交");
    submit.type = "button";
    foot.appendChild(submit);
    body.appendChild(foot);

    card.appendChild(body);

    /* 点评挂在 body 之外：body 收起时它要留着，
       否则学生答完就再也看不到 AI 说了什么 */
    var critique = el("div", "lens__critique");
    critique.hidden = true;
    card.appendChild(critique);

    var record = {
      lens: lens, node: card, body: body, textarea: textarea,
      submit: submit, critique: critique, done: false
    };

    submit.addEventListener("click", function () { send(record); });
    textarea.addEventListener("input", function () {
      submit.disabled = textarea.value.trim().length < 6;
    });
    submit.disabled = true;

    host.appendChild(card);
    return record;
  }

  /* ── 卡片状态布局 ────────────────────────────────────── */

  function layout() {
    var openIndex = cards.findIndex(function (c) { return !c.done; });
    var allDone = openIndex === -1;

    cards.forEach(function (card, i) {
      card.node.classList.toggle("is-done", card.done);
      card.node.classList.toggle("is-open", i === openIndex);

      /* 展开态才显示输入区；已完成收起 */
      card.body.hidden = card.done;

      /* 未轮到且未完成的卡片整卡变灰 */
      card.node.classList.toggle("is-locked", !card.done && i !== openIndex);
    });

    nextBtn.hidden = !allDone;
    if (allDone) {
      hint.textContent = "三个视角都答完了。可以进入课堂讨论了。";
      hint.hidden = false;
    } else {
      hint.textContent = "还剩 " + (cards.length - doneCount) + " 个视角";
      hint.hidden = false;
    }
  }

  /* ── 提交 ────────────────────────────────────────────── */

  function send(record) {
    var answer = record.textarea.value.trim();
    if (answer.length < 6) return;

    record.submit.disabled = true;
    record.submit.textContent = "AI 正在看…";

    submitReflection({
      sessionId: ctx.sessionId,
      lessonId: ctx.lessonId,
      lens: record.lens.key,
      answer: answer
    }).then(function (res) {
      showCritique(record, res.critique);
      record.done = true;
      doneCount++;
      layout();
    }).catch(function (err) {
      record.submit.disabled = false;
      record.submit.textContent = "提交";
      ctx.toast("提交失败：" + err.message);
    });
  }

  function showCritique(record, critique) {
    var meta = VERDICT[critique.verdict] || VERDICT.good;
    record.critique.className = "lens__critique is-" + meta.tone;
    record.critique.innerHTML = "";

    record.critique.appendChild(el("p", "lens__verdict", meta.label));

    /* 点评正文可能含 **粗体**，走 renderInline（先转义再解析） */
    var comment = el("p", "lens__comment");
    comment.innerHTML = renderInline(critique.comment);
    record.critique.appendChild(comment);

    if (critique.followUp) {
      var follow = el("p", "lens__follow");
      follow.appendChild(el("span", "lens__follow-tag", "再想一层"));
      var text = el("span");
      text.innerHTML = renderInline(critique.followUp);
      follow.appendChild(text);
      record.critique.appendChild(follow);
    }

    record.critique.hidden = false;
  }

  /* ── 对外接口 ────────────────────────────────────────── */

  return {
    mount: function () {
      buildCards();
      /* 保留手动推进，但推不推由后端判定 */
      nextBtn.addEventListener("click", function () {
        nextBtn.disabled = true;
        ctx.sendControl(CONTINUE_EVENT).catch(function (err) {
          nextBtn.disabled = false;
          ctx.toast("发送失败：" + err.message);
        });
      });
    },

    enter: function () {
      replayEntryAnimation(pane);
    },

    leave: function () {},

    /* 重开一次（深链回到本阶段且想重做时可用） */
    reset: function () {
      buildCards();
    }
  };
}
