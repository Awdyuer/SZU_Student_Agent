/* 总结复述：在对话框中提交总结、阅读反馈和决定下一步。 */
import { $, appendChatMessage } from "./ui.js";
import { reviewSummary, CONTINUE_EVENT } from "./api.js";

function introFor(lesson) {
  return "现在请用你自己的话讲一遍刚才学到的「" + (lesson ? lesson.title : "本节课") + "」。不用翻资料，想到多少说多少。\n可以说说核心概念、解决的问题和一个具体例子。";
}

function formatReview(review) {
  var lines = ["我看完你的总结了，下面是反馈："];
  [
    ["你讲对的", review.strengths],
    ["还可以补上的", review.gaps],
    ["补充说明", review.supplements]
  ].forEach(function (group) {
    if (group[1] && group[1].length) {
      lines.push("\n" + group[0] + "：");
      group[1].forEach(function (item) { lines.push("• " + item); });
    }
  });
  if (review.connections && review.connections.length) {
    lines.push("\n和以前内容的关联：");
    review.connections.forEach(function (item) { lines.push("• " + item.lesson + "：" + item.note); });
  }
  lines.push("\n你可以再改一版，或者进入下一阶段。");
  return lines.join("\n");
}

export function createStage(ctx) {
  var log = $("summary-log");
  var form = $("summary-composer");
  var input = $("summary-input");
  var count = $("summary-count");
  var submitBtn = $("summary-submit");
  var actions = $("summary-actions");
  var nextBtn = $("summary-next");
  var submitted = false;
  var busy = false;

  function updateCount() {
    count.textContent = input.value.length + " / 600";
    count.classList.toggle("is-near", input.value.length > 510);
    submitBtn.disabled = busy || input.value.trim().length < 10;
  }

  function submit() {
    var text = input.value.trim();
    if (busy || text.length < 10) return;
    busy = true;
    input.disabled = true;
    var message = appendChatMessage(log, "me", text);
    input.value = "";
    updateCount();
    reviewSummary({ sessionId: ctx.sessionId, lessonId: ctx.lessonId, segmentId: "seg-001", text: text })
      .then(function (res) {
        submitted = true;
        appendChatMessage(log, "ai", formatReview(res.review));
        actions.hidden = false;
        form.hidden = true;
      }).catch(function (err) {
        message.remove();
        input.value = text;
        ctx.toast("提交失败：" + err.message);
      }).finally(function () {
        busy = false;
        input.disabled = false;
        updateCount();
      });
  }

  return {
    mount: function () {
      input.maxLength = 600;
      appendChatMessage(log, "ai", introFor(ctx.getLesson()));
      input.addEventListener("input", updateCount);
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
      });
      form.addEventListener("submit", function (event) { event.preventDefault(); submit(); });
      $("summary-revise").addEventListener("click", function () {
        submitted = false;
        actions.hidden = true;
        form.hidden = false;
        appendChatMessage(log, "ai", "好的，再讲一版吧。我会重新看你的总结。");
        input.focus();
      });
      nextBtn.addEventListener("click", function () {
        nextBtn.disabled = true;
        var previousPhase = ctx.getPhase();
        ctx.sendControl(CONTINUE_EVENT).then(function () {
          if (ctx.getPhase() === previousPhase) nextBtn.disabled = false;
        }).catch(function (err) {
          nextBtn.disabled = false;
          ctx.toast("发送失败：" + err.message);
        });
      });
      updateCount();
    },
    enter: function () {
      actions.hidden = !submitted;
      form.hidden = submitted;
      if (!submitted) input.focus();
    },
    leave: function () {},
    reset: function () {
      log.innerHTML = "";
      appendChatMessage(log, "ai", introFor(ctx.getLesson()));
      input.value = "";
      input.disabled = false;
      submitted = false;
      busy = false;
      nextBtn.disabled = false;
      actions.hidden = true;
      form.hidden = false;
      updateCount();
    }
  };
}
