import { expect, test } from "@playwright/test";

for (const width of [1280, 360]) {
test(`Word pagination and comment highlighting at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
  test.skip(!project, "Set a Supabase project URL to exercise the browser with mocked responses.");
  const origin = new URL(project!).origin;
  const id = "00000000-0000-4000-8000-000000000001";
  const user = { id, email: "writer@example.com", aud: "authenticated", role: "authenticated" };
  const payload = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.test`;
  let row = {
    id, title: "Pagination draft", file_format: "docx", owner_id: id,
    updated_at: new Date().toISOString(), revision: 0, collaboration_state: null,
    content: { type: "doc", content: [{ type: "paragraph" }] },
  };
  await page.routeWebSocket(origin.replace(/^http/, "ws") + "/realtime/v1/**", (socket) => socket.close());
  await page.route(`${origin}/**`, async (route) => {
    const { pathname, searchParams } = new URL(route.request().url());
    if (pathname.endsWith("/auth/v1/token")) {
      return route.fulfill({ json: { access_token: token, refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, user } });
    }
    if (pathname.endsWith("/rest/v1/documents")) {
      if (route.request().method() === "PATCH") {
        row = { ...row, ...route.request().postDataJSON(), revision: row.revision + 1 };
      }
      return route.fulfill({ json: searchParams.has("id") ? row : [row] });
    }
    if (pathname.endsWith("/rest/v1/document_comments")) {
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: /Pagination draft/ }).click();
  const editor = page.getByRole("textbox", { name: "Document content" });
  const fitsScreen = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await editor.fill("Automatic pagination should flow across a sheet. ".repeat(110));
  expect(await fitsScreen()).toBe(true);
  await expect(editor.locator("[data-auto-page]").first()).toBeVisible();
  const initialBreaks = await editor.locator("[data-auto-page]").count();
  await page.getByRole("button", { name: "Paper size" }).click();
  await page.getByRole("menuitem", { name: width < 550 ? "Letter" : "A5" }).click();
  await expect.poll(() => editor.locator("[data-auto-page]").count()).toBeGreaterThan(initialBreaks);

  await editor.press("Control+Home");
  await editor.press("Shift+End");
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Comments" })).toBeVisible();
  await expect(editor.locator(".comment-highlight").first()).toBeVisible();
  expect(await fitsScreen()).toBe(true);
  await page.getByRole("button", { name: "Close comments" }).click();
  await expect(editor.locator(".comment-highlight")).toHaveCount(0);
});
}
