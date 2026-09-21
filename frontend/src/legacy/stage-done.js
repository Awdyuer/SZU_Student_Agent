/* ═══════════════════════════════════════════════════════════
   课程结束态
   四个阶段走完后收束：本节课覆盖的知识点 + 去课后的入口
   ═══════════════════════════════════════════════════════════ */

import { $, el } from "./ui.js";

export function createStage(ctx) {

  var list = $("done-kps");

  function renderKnowledgePoints() {
    var lesson = ctx.getLesson();
    if (!lesson || !lesson.knowledgePoints) return;

    list.innerHTML = "";
    lesson.knowledgePoints.forEach(function (name, i) {
      var item = el("li", "done__kp");

      var num = el("span", "done__kp-num", String(i + 1));
      item.appendChild(num);
      item.appendChild(el("span", "done__kp-name", name));

      list.appendChild(item);
    });
  }

  return {
    mount: function () {
      $("done-to-review").addEventListener("click", function () {
        /* 去「课后」（内容待定，现在是占位） */
        location.hash = ctx.getReviewHash();
      });

      /* 重新演示：确认 → 清空后端运行时状态 → 整页刷新回到课前。
         反复演示同一节课的场景，否则每回都得手动清 runtime/ 文件。 */
      $("btn-demo-reset").addEventListener("click", function () {
        if (!window.confirm("重新演示会清空本机全部课堂记录与掌握档案，回到课前。确定？")) return;
        ctx.resetDemo()
          .then(function () { location.reload(); })
          .catch(function (err) { ctx.toast("重置失败：" + err.message); });
      });
    },

    enter: function () {
      ctx.setStatus("已结束");
      renderKnowledgePoints();
    },

    leave: function () {}
  };
}
