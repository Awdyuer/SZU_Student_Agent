/* ═══════════════════════════════════════════════════════════
   「引导学习」这一幕的三个子界面
   idle（课前）→ chat（AI 介绍对话）→ video（教学视频）

   idle→chat 是学生点「开始上课」；chat→video 是点「播放视频」，
   这两步是前端的局部切换。video 之后要通知后端（/视频结束），
   由后端决定下一幕是什么。
   ═══════════════════════════════════════════════════════════ */

import { $, el, icon, renderInline, scrollToEnd } from "./ui.js";
import {
  sendChat, fetchLessonVideo,
  CLASS_START_EVENT, VIDEO_END_EVENT
} from "./api.js";
import { mountVideoPlayer } from "./video-player.js";

export function createStage(ctx) {

  var chatLog = $("chat-log");
  var composer = $("composer");
  var input = $("composer-input");
  var sendBtn = $("composer-send");
  var idle = $("stage-idle");
  var chat = $("stage-chat");
  var video = $("stage-video");

  var introDone = false;      /* 课程介绍是否讲完（决定要不要显示「播放视频」）*/
  var busy = false;           /* 一次请求进行中 */

  /* ── 子阶段切换 ──────────────────────────────────────── */

  var PANES = { idle: idle, chat: chat, video: video };

  function showPane(name) {
    Object.keys(PANES).forEach(function (key) {
      PANES[key].hidden = key !== name;
    });
  }

  /* ── 课前：课程信息 ──────────────────────────────────── */

  function renderLesson(data) {
    $("lesson-eyebrow").textContent = data.course + " · " + data.chapter;
    $("lesson-title").textContent = data.title;
    $("lesson-summary").textContent = data.summary;
    $("meta-kp").textContent = data.knowledgePointCount;
    $("meta-seg").textContent = data.segmentCount;
    $("meta-min").textContent = data.estimatedMinutes;
  }

  /* ── AI 对话 ─────────────────────────────────────────── */

  function appendMessage(role, text) {
    var row = el("div", "msg msg--" + (role === "me" ? "me" : "ai"));

    if (role !== "me") {
      row.appendChild(el("div", "msg__avatar", "AI"));
    }

    var bubble = el("div", "msg__bubble");
    bubble.innerHTML = renderInline(text);
    row.appendChild(bubble);

    chatLog.appendChild(row);
    scrollToEnd(chatLog);
    return row;
  }

  function showTyping() {
    var row = el("div", "msg msg--ai");
    row.id = "typing-row";
    row.appendChild(el("div", "msg__avatar", "AI"));

    var bubble = el("div", "msg__bubble typing");
    bubble.innerHTML = "<span></span><span></span><span></span>";
    row.appendChild(bubble);

    chatLog.appendChild(row);
    scrollToEnd(chatLog);
  }

  function hideTyping() {
    var row = $("typing-row");
    if (row) row.remove();
  }

  /* 开场白播放期间锁住输入区，避免学生在 AI 还在说话时插话 */
  function setComposerEnabled(on) {
    input.disabled = !on;
    sendBtn.disabled = !on;
  }

  /* 开场白讲完 —— 挂按钮而不是自动跳转。两个原因：
     浏览器会拦截「无用户手势的带声自动播放」；
     学生可能还在读最后一句，画面突然切走很突兀。 */
  function appendIntroAction() {
    var row = el("div", "chat-action");
    var btn = el("button", "btn btn--primary", "开始播放教学视频");
    btn.type = "button";
    btn.appendChild(icon('<path d="M3 8h10M9 4l4 4-4 4"/>'));
    btn.addEventListener("click", function () { startVideo(); });

    row.appendChild(btn);
    chatLog.appendChild(row);
    scrollToEnd(chatLog);
  }

  /* 「开始上课」= 给后端发一条控制消息，由它决定进哪一幕。
     开场白不再由前端逐条播 —— 后端返回什么就显示什么。 */
  function startLesson() {
    if (busy) return;

    showPane("chat");
    ctx.setStatus("课程介绍");

    /* 已经开过课就不再发 —— 回入口再进来时保留进度 */
    if (introDone) return;

    busy = true;
    setComposerEnabled(false);
    showTyping();

    ctx.sendControl(CLASS_START_EVENT).then(function (res) {
      hideTyping();
      var text = res && res.message && res.message.text;
      if (text) appendMessage("ai", text);
      if (res && res.introComplete) {
        introDone = true;
        appendIntroAction();
      }
    }).catch(function (err) {
      hideTyping();
      appendMessage("ai", "上课失败：" + err.message);
    }).finally(function () {
      busy = false;
      setComposerEnabled(true);
    });
  }

  function submitMessage(text) {
    busy = true;
    setComposerEnabled(false);
    appendMessage("me", text);
    showTyping();

    sendChat({
      sessionId: ctx.sessionId,
      lessonId: ctx.lessonId,
      message: text
    }).then(function (res) {
      hideTyping();
      appendMessage("ai", res.message.text);
      if (res.introComplete && !introDone) {
        introDone = true;
        appendIntroAction();
      }
    }).catch(function (err) {
      hideTyping();
      appendMessage("ai", "消息发送失败：" + err.message);
    }).finally(function () {
      busy = false;
      setComposerEnabled(true);
    });
  }

  /* ── 教学视频 ────────────────────────────────────────── */

  /* 视频结束只通知后端一次 —— 自然播完和手动点按钮都可能触发。
     看视频不是「一轮对话」，所以发一条约定的控制消息，由后端的
     classify_turn 去识别。前端不自己决定下一步。 */
  var videoEndNotified = false;
  var playerHandle = null;

  function destroyPlayer() {
    if (playerHandle) playerHandle.destroy();
    playerHandle = null;
  }

  function notifyVideoEnd(how) {
    if (videoEndNotified) return;
    videoEndNotified = true;

    var status = $("video-player-status");
    status.textContent = how === "ended"
      ? "视频已播完，正在通知老师…"
      : "已通知老师，等待下一步…";

    sendChat({
      sessionId: ctx.sessionId,
      lessonId: ctx.lessonId,
      message: VIDEO_END_EVENT,
      now: new Date().toISOString()
    }).then(function (res) {
      if (res && res.message && res.message.text) appendMessage("ai", res.message.text);
      ctx.applyServerTurn(res);
    }).catch(function (err) {
      status.textContent = "通知失败：" + err.message;
      ctx.toast("通知失败：" + err.message);
      videoEndNotified = false;   /* 允许重试 */
    });
  }

  function startVideo() {
    showPane("video");
    ctx.setStatus("教学视频");

    videoEndNotified = false;     /* 重进视频页时重置 */

    var slot = $("video-player-slot");
    destroyPlayer();
    $("video-player-status").textContent = "正在准备播放器…";

    fetchLessonVideo(ctx.lessonId).then(function (data) {
      var lesson = ctx.getLesson();
      var first = lesson && lesson.segments && lesson.segments[0];
      playerHandle = mountVideoPlayer(slot, {
        lessonId: ctx.lessonId,
        video: data || null,
        startSeconds: first && typeof first.startSeconds === "number" ? first.startSeconds : 0,
        onEnded: function () { notifyVideoEnd("ended"); },
        onError: function (error) {
          var message = error && error.message ? error.message : String(error || "未知错误");
          $("video-player-status").textContent = "播放器错误：" + message;
          ctx.toast("播放器错误：" + message);
        }
      });
      $("video-player-status").textContent = playerHandle.mounted
        ? "播放器已接入"
        : "等待接入外部视频播放器";
    }).catch(function (err) {
      $("video-player-status").textContent = "视频信息获取失败：" + err.message;
    });
  }

  /* ── 对外接口 ────────────────────────────────────────── */

  return {
    mount: function () {
      $("btn-start").addEventListener("click", startLesson);

      $("btn-skip-video").addEventListener("click", function () {
        notifyVideoEnd("manual");
      });

      composer.addEventListener("submit", function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text || busy) return;
        input.value = "";
        input.style.height = "auto";
        submitMessage(text);
      });

      /* Enter 发送，Shift+Enter 换行 */
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          composer.requestSubmit();
        }
      });

      /* 输入框自动增高 */
      input.addEventListener("input", function () {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 132) + "px";
      });
    },

    enter: function (stage) {
      if (stage === "idle") {
        showPane("idle");
      } else if (stage === "chat") {
        showPane("chat");
        ctx.setStatus(introDone ? "引导学习" : "课程介绍");
      } else if (stage === "video") {
        showPane("video");
        ctx.setStatus("教学视频");
      }
    },

    leave: function () {
      /* 离开时把在途打字指示器收掉，避免下次进来还挂着 */
      hideTyping();
      destroyPlayer();
    },

    /* 换课：清空对话、开场白进度与视频，回到课前 */
    reset: function () {
      chatLog.innerHTML = "";
      introDone = false;
      busy = false;
      setComposerEnabled(true);

      input.value = "";
      input.style.height = "auto";
      input.placeholder = "说点什么，或向老师提问…";

      destroyPlayer();
      $("video-player-slot").replaceChildren();
      $("video-player-status").textContent = "等待接入外部视频播放器";

      showPane("idle");
    },

    renderLesson: renderLesson
  };
}
