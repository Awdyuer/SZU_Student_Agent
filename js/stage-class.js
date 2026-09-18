/* ═══════════════════════════════════════════════════════════
   阶段 1「引导学习」的三个子阶段
   idle（课前）→ chat（AI 介绍对话）→ video（教学视频）
   video 看完后交给 ctx.advance('summary')
   ═══════════════════════════════════════════════════════════ */

import { $, el, icon, delay, renderInline, scrollToEnd, replayEntryAnimation } from "./ui.js";
import { MOCK_INTRO, sendChat, fetchLessonVideo } from "./api.js";

export function createStage(ctx) {

  var chatLog = $("chat-log");
  var composer = $("composer");
  var input = $("composer-input");
  var sendBtn = $("composer-send");
  var idle = $("stage-idle");
  var chat = $("stage-chat");
  var video = $("stage-video");

  var introDone = false;      /* 课程介绍是否讲完 */
  var introIndex = 0;         /* 已播到第几句开场白 */
  var introPlaying = false;   /* 开场白播放中 */
  var busy = false;           /* 一次请求进行中 */

  /* ── 子阶段切换 ──────────────────────────────────────── */

  var PANES = { idle: idle, chat: chat, video: video };

  function showPane(name) {
    Object.keys(PANES).forEach(function (key) {
      PANES[key].hidden = key !== name;
    });
    replayEntryAnimation(PANES[name]);
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

  function playIntroStep(index) {
    introIndex = index;

    if (index >= MOCK_INTRO.length) {
      introDone = true;
      introPlaying = false;
      setComposerEnabled(true);
      appendIntroAction();
      return Promise.resolve();
    }

    showTyping();
    /* 打字时长跟着句子长度走，读起来才自然 */
    return delay(560 + MOCK_INTRO[index].length * 9).then(function () {
      hideTyping();
      appendMessage("ai", MOCK_INTRO[index]);
      return playIntroStep(index + 1);
    });
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

  function startLesson() {
    if (introPlaying) return;

    showPane("chat");
    ctx.rail.setBadge("课程介绍");

    /* 已播过就不重播 —— 回入口再进来时保留进度 */
    if (introDone || introIndex > 0) return;

    introPlaying = true;
    setComposerEnabled(false);
    playIntroStep(0);
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

  function startVideo() {
    showPane("video");
    ctx.rail.setBadge("教学视频");

    var frame = $("video-frame");
    frame.innerHTML = "";
    $("video-title").textContent = "教学视频";
    $("video-sub").textContent = "正在获取…";

    fetchLessonVideo(ctx.lessonId).then(function (data) {
      if (data && data.url) mountVideo(frame, data);
      else mountVideoEmpty(frame);
    }).catch(function (err) {
      mountVideoEmpty(frame, err.message);
    });
  }

  function mountVideo(frame, data) {
    var node = document.createElement("video");
    node.controls = true;
    node.playsInline = true;
    node.preload = "metadata";
    node.src = data.url;
    if (data.poster) node.poster = data.poster;

    /* 从第一个片段的位置播起 —— 片段是整条视频上的时间段 */
    var lesson = ctx.getLesson();
    var first = lesson && lesson.segments && lesson.segments[0];
    if (first && typeof first.startSeconds === "number") {
      node.addEventListener("loadedmetadata", function () {
        node.currentTime = first.startSeconds;
      }, { once: true });
    }

    frame.appendChild(node);
    $("video-title").textContent = data.title || "教学视频";
    $("video-sub").textContent =
      "来源 " + (data.source || "openmaic") +
      (data.duration ? " · 全长 " + formatDuration(data.duration) : "");
  }

  function mountVideoEmpty(frame, errorText) {
    var box = el("div", "video__empty");
    box.innerHTML =
      '<span class="video__empty-icon">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="2" y="4" width="20" height="16" rx="3"/>' +
          '<path d="M10 9.5v5l4.5-2.5-4.5-2.5z" fill="currentColor" stroke="none"/>' +
        "</svg>" +
      "</span>" +
      '<p class="video__empty-title">教学视频接口待接入</p>' +
      '<p class="video__empty-text">' +
        (errorText ? "请求失败：" + escapeText(errorText) + "<br>" : "") +
        "接 <code>GET /api/lesson/video?lessonId=</code> 后，这里播放老师端生成的成片。" +
      "</p>";

    frame.appendChild(box);
    $("video-title").textContent = "教学视频";
    $("video-sub").textContent = "接口未接入 · 显示占位";
  }

  function escapeText(text) {
    return String(text).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function formatDuration(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  /* ── 对外接口 ────────────────────────────────────────── */

  return {
    mount: function () {
      $("btn-start").addEventListener("click", startLesson);

      /* 视频看完 → 进入阶段 2 */
      $("btn-skip-video").addEventListener("click", function () {
        ctx.advance("summary");
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
        ctx.rail.setBadge(introDone ? "引导学习" : "课程介绍");
      } else if (stage === "video") {
        showPane("video");
        ctx.rail.setBadge("教学视频");
      }
    },

    leave: function () {
      /* 离开时把在途打字指示器收掉，避免下次进来还挂着 */
      hideTyping();
    },

    /* 换课：清空对话、开场白进度与视频，回到课前 */
    reset: function () {
      chatLog.innerHTML = "";
      introDone = false;
      introIndex = 0;
      introPlaying = false;
      busy = false;
      setComposerEnabled(true);

      input.value = "";
      input.style.height = "auto";
      input.placeholder = "说点什么，或向老师提问…";

      $("video-frame").innerHTML = "";
      $("video-title").textContent = "教学视频";
      $("video-sub").textContent = "老师端生成";

      showPane("idle");
    },

    renderLesson: renderLesson
  };
}
