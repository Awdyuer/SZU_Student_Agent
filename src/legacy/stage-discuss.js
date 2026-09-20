/* ═══════════════════════════════════════════════════════════
   阶段 4「课堂讨论」
   老师 + 同学 + 我 三种角色的讨论区

   ⚠️ 老师与同学的发言在后端**完全没有支撑**（student_id 硬编码、
      无班级/花名册/讨论组任何结构），这里全走 mock。
      接口见 api.js 的 fetchDiscussion / postDiscussion。
   ═══════════════════════════════════════════════════════════ */

import { $, el, delay, scrollToEnd, reduceMotion } from "./ui.js";
import {
  fetchDiscussion, postDiscussion, MOCK_TEACHER_FOLLOWUP, LESSON_ID, CLASS_END_EVENT
} from "./api.js";

/* 说话人 → 头像与配色 */
var SPEAKERS = {
  host: { avatar: "师", tone: "host" },
  peer: { avatar: "",   tone: "peer" },
  me:   { avatar: "我", tone: "me" }
};

export function createStage(ctx) {

  var topicBox = $("discuss-topic");
  var log = $("discuss-log");
  var composer = $("discuss-composer");
  var input = $("discuss-input");
  var endBtn = $("discuss-end");

  var loaded = false;      /* 首屏讨论是否已拉过 */
  var posted = false;      /* 学生是否已发过言 */
  var followShown = false; /* 老师的追问是否已出现 */
  var ended = false;

  /* ── 渲染一条发言 ────────────────────────────────────── */

  function renderMessage(msg) {
    var meta = SPEAKERS[msg.speaker] || SPEAKERS.peer;

    var row = el("div", "dm dm--" + meta.tone);

    /* 只有非本人消息显示头像 */
    if (msg.speaker !== "me") {
      var avatar = el("div", "dm__avatar");
      avatar.textContent = msg.speaker === "peer" ? (msg.name || "同").slice(0, 1) : meta.avatar;
      row.appendChild(avatar);
    }

    var body = el("div", "dm__body");

    var head = el("div", "dm__head");
    head.appendChild(el("span", "dm__name", msg.speaker === "me" ? "我" : msg.name));
    head.appendChild(el("span", "dm__time", msg.at || ""));
    body.appendChild(head);

    var bubble = el("div", "dm__bubble");
    bubble.textContent = msg.text;
    body.appendChild(bubble);

    row.appendChild(body);
    log.appendChild(row);
    scrollToEnd(log);
    return row;
  }

  function renderTopic(topic) {
    topicBox.innerHTML = "";

    var label = el("p", "discuss-topic__label");
    label.appendChild(el("span", "discuss-topic__dot"));
    label.appendChild(el("span", null, "老师提出的讨论题"));
    topicBox.appendChild(label);

    topicBox.appendChild(el("p", "discuss-topic__text", topic));
  }

  /* ── 首屏加载 ────────────────────────────────────────── */

  function load() {
    if (loaded) return Promise.resolve();

    log.innerHTML = "";
    return fetchDiscussion(ctx.lessonId).then(function (data) {
      loaded = true;
      renderTopic(data.topic);

      /* 逐条带节奏地出现，比一次性铺满更像真实讨论 */
      var chain = Promise.resolve();
      data.messages.forEach(function (msg, i) {
        chain = chain.then(function () {
          renderMessage(msg);
          return reduceMotion ? null : delay(i === 0 ? 0 : 520);
        });
      });
      return chain;
    }).catch(function (err) {
      ctx.toast("讨论加载失败：" + err.message);
    });
  }

  /* ── 发言 ────────────────────────────────────────────── */

  function send(text) {
    input.disabled = true;
    $("discuss-send").disabled = true;

    postDiscussion({
      sessionId: ctx.sessionId,
      lessonId: ctx.lessonId,
      text: text
    }).then(function (res) {
      renderMessage(res.message);
      posted = true;

      /* 学生发过言之后，老师追一句 —— 这是 mock，
         真实场景由后端推送讨论流（GET /api/discussion 轮询或 SSE） */
      return delay(reduceMotion ? 0 : 900).then(function () {
        if (followShown) return;
        followShown = true;
        renderMessage({
          id: "host-follow",
          speaker: "host",
          name: "老师",
          text: ctx.lessonId === LESSON_ID ? MOCK_TEACHER_FOLLOWUP : "这个角度很有启发。你能再举一个具体例子，说明自己的理由吗？",
          at: new Date().toTimeString().slice(0, 5)
        });
        endBtn.hidden = false;
      });
    }).catch(function (err) {
      ctx.toast("发送失败：" + err.message);
    }).finally(function () {
      input.disabled = false;
      $("discuss-send").disabled = false;
      input.focus();
    });
  }

  /* ── 收尾 ────────────────────────────────────────────── */

  function endDiscussion() {
    if (ended) return;
    ended = true;

    endBtn.disabled = true;
    endBtn.textContent = "老师正在总结…";

    /* 结束也是「一轮」：发控制消息，老师的收尾发言与新的 host_phase
       都由后端这一轮返回。前端不自己切到结束态。 */
    ctx.sendControl(CLASS_END_EVENT).then(function (res) {
      var text = res && res.message && res.message.text;
      if (text) {
        renderMessage({
          id: "host-closing",
          speaker: "host",
          name: "老师",
          text: text,
          at: new Date().toTimeString().slice(0, 5)
        });
      }
      composer.hidden = true;
      endBtn.hidden = true;
    }).catch(function (err) {
      ended = false;
      endBtn.disabled = false;
      endBtn.textContent = "结束本节课";
      ctx.toast("失败：" + err.message);
    });
  }

  /* ── 对外接口 ────────────────────────────────────────── */

  return {
    mount: function () {
      composer.addEventListener("submit", function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text) return;
        input.value = "";
        send(text);
      });

      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          composer.requestSubmit();
        }
      });

      endBtn.addEventListener("click", endDiscussion);
    },

    enter: function () {
      if (!loaded) load();
      if (!posted) setTimeout(function () { input.focus(); }, 300);
    },

    leave: function () {},

    /* 换课：清空讨论流与老师/同学的 mock 进度 */
    reset: function () {
      log.innerHTML = "";
      topicBox.innerHTML = "";
      input.value = "";
      input.disabled = false;

      composer.hidden = false;
      endBtn.hidden = true;
      endBtn.disabled = false;
      endBtn.textContent = "结束本节课";

      loaded = false;
      posted = false;
      followShown = false;
      ended = false;
    }
  };
}
