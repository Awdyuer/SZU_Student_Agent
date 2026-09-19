/* ═══════════════════════════════════════════════════════════
   阶段过渡遮罩

   后端说进入另一幕时播一次：全屏毛玻璃淡入 → 阶段名浮起 →
   在遮罩下换内容 → 揭开。总时长约 0.9 秒。

   prefers-reduced-motion 下直接切换，不动画。
   ═══════════════════════════════════════════════════════════ */

import { $, delay, waitForAnimation, reduceMotion } from "./ui.js";
import { labelOf, descOf } from "./phases.js";

export function createVeil() {
  var el = $("phase-veil");
  var title = $("veil-title");
  var desc = $("veil-desc");

  /* phase 是后端的 host_phase 值；swapFn 在遮罩下执行，它的耗时被盖住 */
  async function play(phase, swapFn) {
    if (reduceMotion || !el) {
      if (swapFn) await swapFn();
      return;
    }

    title.textContent = labelOf(phase);
    desc.textContent = descOf(phase);

    el.hidden = false;
    el.classList.remove("is-leaving");
    el.classList.add("is-entering");
    void el.offsetWidth;            /* 强制回流，确保动画从头播 */
    await delay(250);               /* 淡入（动画 .26s） */

    if (swapFn) await swapFn();     /* 内容在遮罩下完成切换 */

    await delay(380);               /* 停留一拍，够读完阶段名 */
    el.classList.remove("is-entering");
    el.classList.add("is-leaving");
    await waitForAnimation(el, 280);  /* 淡出动画 .22s，280 作兜底 */

    el.classList.remove("is-leaving");
    el.hidden = true;
  }

  return { play: play };
}
