import { expect, test } from "@playwright/test";

const pageErrors = new WeakMap<import("@playwright/test").Page, string[]>();

async function enterEncounter(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Принять сигнал" }).click();
  await page.getByRole("button", { name: "Войти в диспетчерскую" }).click();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("button", { name: "К задаче" }).click();
  await expect(page.getByRole("heading", { name: "Заряди узлы поровну" })).toBeVisible();
  await page.getByText("Управлять кнопками вместо перетаскивания").click();
}

async function placeToken(page: import("@playwright/test").Page, token: number, zone: "node_alpha" | "node_beta" | "node_gamma") {
  await page.getByTestId(`token-${token}`).click();
  await page.getByTestId(`place-${zone}`).click();
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("likagame_playable");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test("@p0 presents dialogue as voice-only and repeats it from the character", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Принять сигнал" }).click();
  await page.getByRole("button", { name: "Войти в диспетчерскую" }).click();
  await page.getByRole("button", { name: "Дальше" }).click();

  const pik = page.getByRole("button", { name: "Пик: повторить последнюю реплику" });
  await expect(pik).toBeVisible();
  await expect(page.locator("body")).not.toContainText("П-приём… Я Пик");
  await expect(pik).toHaveAttribute("data-speaking", "true");

  await expect(pik).toHaveAttribute("data-speaking", "false", { timeout: 10_000 });
  await pik.click();
  await expect(pik).toHaveAttribute("data-speaking", "true");
});

test("@p0 completes the playable checkpoint", async ({ page }) => {
  await enterEncounter(page);
  await placeToken(page, 1, "node_alpha");
  await placeToken(page, 2, "node_alpha");
  await placeToken(page, 3, "node_beta");
  await placeToken(page, 4, "node_beta");
  await placeToken(page, 5, "node_gamma");
  await placeToken(page, 6, "node_gamma");

  await expect(page.getByText("4 из 4")).toHaveCount(3);
  await page.getByTestId("commit-button").click();
  await expect(page.getByText("Три узла синхронизированы")).toBeVisible();
  await expect(page.getByLabel("Всего импульсов")).toBeVisible({ timeout: 5_000 });

  await page.getByLabel("Всего импульсов").fill("12");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText("12 импульсов")).toBeVisible();
  await page.getByRole("button", { name: "Открыть канал связи" }).click();
  await expect(page.getByRole("heading", { name: "Первая комната пройдена" })).toBeVisible();
});

test("@p0 restores an in-progress candidate after reload", async ({ page }) => {
  await enterEncounter(page);
  await placeToken(page, 1, "node_alpha");
  await placeToken(page, 2, "node_beta");
  await page.waitForTimeout(400);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Заряди узлы поровну" })).toBeVisible();
  await expect(page.getByText("Прогресс восстановлен")).toBeVisible();
  await page.getByText("Управлять кнопками вместо перетаскивания").click();
  await expect(page.getByTestId("token-1")).toContainText("узел Альфа");
  await expect(page.getByTestId("token-2")).toContainText("узел Бета");
});
