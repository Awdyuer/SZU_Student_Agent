import { expect, test } from "@playwright/test";

test("student can move through all classroom stages without ending on first discussion message", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /操作系统/ }).click();
  await page.locator(".week-tile").click();
  await page.locator('[data-goto="class"]').click();

  await expect(page.locator("#lesson-title")).toContainText("处理机调度");
  await expect(page.locator("#btn-start")).toBeEnabled();
  await page.locator("#btn-start").click();

  await expect(page.locator("#stage-chat")).toBeVisible();
  await expect(page.getByRole("button", { name: /开始播放教学视频/ })).toBeVisible();
  await page.getByRole("button", { name: /开始播放教学视频/ }).click();
  await expect(page.locator("#stage-video")).toBeVisible();

  await page.locator("#btn-skip-video").click();
  await expect(page.locator("#stage-summary")).toBeVisible();
  await page.locator("#summary-input").fill("调度负责决定多个就绪进程谁先使用 CPU，以及运行多长时间。");
  await page.locator("#summary-submit").click();
  await expect(page.locator("#summary-next")).toBeVisible();
  await page.locator("#summary-next").click();

  await expect(page.locator("#stage-reflect")).toBeVisible();
  await page.locator("#reflect-input").fill("没有调度时，一个进程可能长期占用 CPU，其他任务无法及时响应。");
  await page.locator("#reflect-submit").click();
  await expect(page.locator("#reflect-next")).toBeVisible();
  await page.locator("#reflect-next").click();

  await expect(page.locator("#stage-discuss")).toBeVisible();
  await page.locator("#discuss-input").fill("我会使用多级反馈队列，同时兼顾响应速度和吞吐量。");
  await page.locator("#discuss-send").click();

  await expect(page.locator("#stage-discuss")).toBeVisible();
  await expect(page.locator("#stage-done")).toBeHidden();
  await expect(page.locator("#class-badge")).toHaveText("课堂讨论");
  await expect(page.locator("#discuss-log .dm--host")).not.toHaveCount(0);
});
