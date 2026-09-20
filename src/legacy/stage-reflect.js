/* 深入思考：三道问题依次在同一个对话框中进行。 */
import { $, appendChatMessage } from "./ui.js";
import { reflectionLensesFor, submitReflection, CONTINUE_EVENT } from "./api.js";

var VERDICT = { good: "答得不错", partial: "方向对了", shallow: "可以再想想" };

export function createStage(ctx) {
  var log = $("reflect-log");
  var form = $("reflect-composer");
  var input = $("reflect-input");
  var submitBtn = $("reflect-submit");
  var actions = $("reflect-actions");
  var nextBtn = $("reflect-next");
  var index = 0;
  var busy = false;
  function lenses() { return reflectionLensesFor(ctx.lessonId); }

  function askCurrent() {
    var lens = lenses()[index];
    if (!lens) {
      appendChatMessage(log, "ai", "三个视角都聊完了，可以进入课堂讨论了。");
      form.hidden = true;
      actions.hidden = false;
      return;
    }
    appendChatMessage(log, "ai", "第 " + (index + 1) + " 个视角 · " + lens.name + "\n" + lens.question + "\n" + lens.hint);
    input.focus();
  }

  function updateSubmit() {
    submitBtn.disabled = busy || input.value.trim().length < 6;
  }

  function submit() {
    var answer = input.value.trim();
    if (busy || answer.length < 6 || index >= lenses().length) return;
    var lens = lenses()[index];
    busy = true;
    input.disabled = true;
    var message = appendChatMessage(log, "me", answer);
    input.value = "";
    updateSubmit();
    submitReflection({ sessionId: ctx.sessionId, lessonId: ctx.lessonId, lens: lens.key, answer: answer })
      .then(function (res) {
        var critique = res.critique;
        var text = (VERDICT[critique.verdict] || "我的点评") + "\n" + critique.comment;
        if (critique.followUp) text += "\n再想一层：" + critique.followUp;
        appendChatMessage(log, "ai", text);
        index++;
        askCurrent();
      }).catch(function (err) {
        message.remove();
        input.value = answer;
        ctx.toast("提交失败：" + err.message);
      }).finally(function () {
        busy = false;
        input.disabled = false;
        updateSubmit();
        if (index < lenses().length) input.focus();
      });
  }

  return {
    mount: function () {
      input.maxLength = 400;
      askCurrent();
      input.addEventListener("input", updateSubmit);
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
      });
      form.addEventListener("submit", function (event) { event.preventDefault(); submit(); });
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
      updateSubmit();
    },
    enter: function () { if (index < lenses().length) input.focus(); },
    leave: function () {},
    reset: function () {
      log.innerHTML = "";
      index = 0;
      busy = false;
      input.value = "";
      input.disabled = false;
      nextBtn.disabled = false;
      form.hidden = false;
      actions.hidden = true;
      askCurrent();
      updateSubmit();
    }
  };
}
