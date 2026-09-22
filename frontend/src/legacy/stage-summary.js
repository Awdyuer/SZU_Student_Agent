/* 总结复述：在对话框中提交总结、阅读反馈和决定下一步。 */
import { $, appendChatMessage } from "./ui.js";
import { sendMessage, advanceStage } from "./api.js";

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
    sendMessage(ctx.sessionId, text)
      .then(function (res) {
        submitted = true;
        if (res.message.text) appendChatMessage(log, "ai", res.message.text);
        ctx.applyServerTurn(res);
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
        advanceStage(ctx.sessionId).then(function (res) {
          ctx.applyServerTurn(res);
          if (ctx.getPhase() === "recap_discussion") nextBtn.disabled = false;
        }).catch(function (err) {
          nextBtn.disabled = false;
          ctx.toast("发送失败：" + err.message);
        });
      });
      updateCount();
    },
    enter: function (stage, turn) {
      if (turn && turn.message && turn.message.text) {
        appendChatMessage(log, "ai", turn.message.text);
      }
      actions.hidden = !submitted;
      form.hidden = submitted;
      if (!submitted) input.focus();
    },
    leave: function () {},
    receiveMessage: function (text) {
      appendChatMessage(log, "ai", text);
    },
    reset: function () {
      log.innerHTML = "";
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
