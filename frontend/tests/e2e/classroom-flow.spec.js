import { expect, test } from "@playwright/test";

/* 课程数据由老师上传，不在测试里预置具体课程内容。
   这里只验证学生端的登录入口和注册入口可正常加载。 */

test("student login screen loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".login__card")).toBeVisible();
  await expect(page.getByRole("button", { name: "登录", exact: true })).toBeVisible();
});

test("registration form can be opened", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.locator("#login-number")).toBeVisible();
  await expect(page.locator("#login-name")).toBeVisible();
  await expect(page.locator("#login-password")).toBeVisible();
});
