import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type DialogueFixture = {
  dialogue_catalog: Array<{ id: string; text: string }>;
};

const dialogueFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "packages/content/fixtures/content-bundle.json"), "utf8")
) as DialogueFixture;
const dialogueTexts = dialogueFixture.dialogue_catalog.map((line) => line.text);

const pageErrors = new WeakMap<import("@playwright/test").Page, string[]>();

async function enterEncounter(page: import("@playwright/test").Page, muted = false, claimDaily = false) {
  await page.goto("/");
  if (muted) await page.getByRole("button", { name: "Выключить звук" }).click();
  if (claimDaily) {
    await page.getByRole("button", { name: "+1 искра" }).click();
    await expect(page.getByRole("button", { name: /Открыть Хранилище\. Искр сигнала: 1/ })).toBeVisible();
  }
  await page.getByRole("button", { name: "Принять сигнал" }).click();
  await page.getByRole("button", { name: "Войти в диспетчерскую" }).click();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("button", { name: "Как устроена станция" }).click();
  await expect(page.getByRole("heading", { name: "Одинаковые группы" })).toBeVisible();
  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page.getByRole("heading", { name: "Короткая запись" })).toBeVisible();
  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page.getByRole("heading", { name: "Умножение руками" })).toBeVisible();
  await page.getByRole("button", { name: "К первой задаче" }).click();
  await expect(page.getByRole("heading", { name: "Заряди узлы поровну" })).toBeVisible();
  await page.getByText("Управлять кнопками вместо перетаскивания").click();
}

async function placeToken(page: import("@playwright/test").Page, token: number, zone: "node_alpha" | "node_beta" | "node_gamma") {
  await page.getByTestId(`token-${token}`).click();
  await page.getByTestId(`place-${zone}`).click();
}

async function expectDialogueToStayVoiceOnly(page: import("@playwright/test").Page) {
  const visibleText = await page.locator("body").innerText();
  for (const dialogueText of dialogueTexts) {
    expect(visibleText, `Реплика не должна отображаться текстом: ${dialogueText}`).not.toContain(dialogueText);
  }
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
  await expectDialogueToStayVoiceOnly(page);
  await expect(pik).toHaveAttribute("data-speaking", "true");

  await expect(pik).toHaveAttribute("data-speaking", "false", { timeout: 10_000 });
  await pik.click();
  await expect(pik).toHaveAttribute("data-speaking", "true");
});

test("@p0 completes the full three-room adventure", async ({ page }) => {
  await enterEncounter(page, true, true);
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

  await expect(page.getByText("Комната 2 из 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Система маяка: повторить последнюю реплику" })).toBeVisible();
  await expectDialogueToStayVoiceOnly(page);
  await page.getByRole("button", { name: "Открыть грузовой модуль" }).click();

  await expect(page.getByRole("heading", { name: "Проведи сигнал через реле" })).toBeVisible();
  await expect(page.getByTestId("relay-step-size")).toHaveText("2");
  await expect(page.getByTestId("relay-repeat-count")).toHaveText("5");
  await expect(page.getByText("Совмести голубые остановки с золотыми реле")).toBeVisible();
  await expectDialogueToStayVoiceOnly(page);

  await page.getByTestId("relay-run").click();
  await expect(page.getByText("Сигнал остановился раньше приёмника: 10 из 12.")).toBeVisible({ timeout: 5_000 });

  const relayTrack = page.getByTestId("relay-track");
  await relayTrack.scrollIntoViewIfNeeded();
  const relayBox = await relayTrack.boundingBox();
  expect(relayBox).not.toBeNull();
  await page.mouse.move(relayBox!.x + relayBox!.width * (2 / 12), relayBox!.y + relayBox!.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(relayBox!.x + relayBox!.width * (4 / 12), relayBox!.y + relayBox!.height * 0.45, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("relay-step-size")).toHaveText("4");
  await expect(page.getByTestId("relay-repeat-count")).toHaveText("3");
  await page.getByTestId("relay-run").click();
  await expect(page.getByText("Приёмник поймал все три импульса.")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("relay-continue").click();

  await expect(page.getByText("Комната 3 из 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Система маяка: повторить последнюю реплику" })).toBeVisible();
  await expectDialogueToStayVoiceOnly(page);
  await page.getByRole("button", { name: "Войти в ядро маяка" }).click();

  await expect(page.getByRole("heading", { name: "Собери световую решётку" })).toBeVisible();
  await expect(page.getByTestId("grid-rows")).toHaveText("1");
  await expect(page.getByTestId("grid-columns")).toHaveText("1");
  await expect(page.getByTestId("grid-goal")).toHaveAttribute("aria-label", "Форма замка: 4 ряда по 6 ламп, всего 24");
  await expectDialogueToStayVoiceOnly(page);

  const lightGrid = page.getByTestId("light-grid");
  await lightGrid.scrollIntoViewIfNeeded();
  const gridBox = await lightGrid.boundingBox();
  expect(gridBox).not.toBeNull();
  const dragSelection = async (rows: number, columns: number, startRow = 0, startColumn = 0) => {
    const startX = gridBox!.x + gridBox!.width * ((startColumn + 0.5) / 7);
    const startY = gridBox!.y + gridBox!.height * ((startRow + 0.5) / 6);
    const endX = gridBox!.x + gridBox!.width * ((startColumn + columns - 0.5) / 7);
    const endY = gridBox!.y + gridBox!.height * ((startRow + rows - 0.5) / 6);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 8 });
    await page.mouse.up();
  };

  await dragSelection(6, 4);
  await expect(lightGrid).toHaveAttribute("aria-label", "Выделено 6 рядов, 4 столбцов, 24 ламп");
  await page.getByTestId("grid-run").click();
  await expect(page.getByText("24 огня — количество верное. Но прямоугольник повёрнут другой стороной.")).toBeVisible({ timeout: 5_000 });

  await dragSelection(4, 6, 1, 1);
  await page.getByTestId("grid-run").click();
  await expect(page.getByText("Размер и количество верны. Теперь совмести голубую рамку с золотым контуром.")).toBeVisible({ timeout: 5_000 });

  await dragSelection(4, 6);
  await expect(lightGrid).toHaveAttribute("aria-label", "Выделено 4 рядов, 6 столбцов, 24 ламп");
  await page.getByTestId("grid-run").click();
  await expect(page.getByText("Решётка совпала с формой замка.")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("grid-continue").click();

  await expect(page.getByRole("heading", { name: "Все три комнаты пройдены" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Система маяка: повторить последнюю реплику" })).toBeVisible();
  await expect(page.getByTestId("vault-reward")).toContainText("Знак хранителя Маяка-7");
  await expectDialogueToStayVoiceOnly(page);

  await page.getByRole("button", { name: "Пройти ещё раз" }).click();
  await expect(page.getByText("Подарок уже в Хранилище")).toBeVisible();
  await expect(page.getByRole("button", { name: /Открыть Хранилище\. Искр сигнала: 1/ })).toBeVisible();
  await page.getByRole("button", { name: /Открыть Хранилище/ }).click();
  await expect(page.getByText("Знак Маяка найден")).toBeVisible();
});

test("@p0 restores an in-progress candidate after reload", async ({ page }) => {
  await enterEncounter(page, true);
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
