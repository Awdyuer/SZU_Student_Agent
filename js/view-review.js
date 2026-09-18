/* ═══════════════════════════════════════════════════════════
   课后

   页面留空，只保留入口与路由。内容待定，不要往这里加东西。

   将来要用的话，接口契约已经记在 api.js 末尾：
     GET /api/courses/<courseId>/lessons
   ═══════════════════════════════════════════════════════════ */

import { $, replayEntryAnimation } from "./ui.js";

export function createView() {

  var pane = $("view-review");

  return {
    mount: function () {},

    enter: function () {
      replayEntryAnimation(pane);
    },

    leave: function () {}
  };
}
