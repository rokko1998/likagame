# LikaGame — playable demo

Первый сквозной playable checkpoint игры «Маяк-7»: короткий сюжетный вход, фиксированная карта приключения, E01 `allocate_equal`, проверка решения, системное числовое поле, локальный checkpoint и обезличенный telemetry export.

## Запуск

```bash
npm install
npm run dev
```

Production-проверки:

```bash
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

Приложение использует `BrowserHost` вне Telegram и автоматически переключается на `TelegramHost`, если доступен `window.Telegram.WebApp`.

## Структура

- `apps/web` — React shell и Phaser-сцена;
- `packages/game-core` — чистый детерминированный reducer и validator;
- `packages/contracts` — сериализуемые типы и JSON Schema;
- `packages/content` — связанный E01 fixture и fixed RunPlan;
- `assets` — curated runtime subset и CC0-лицензии Kenney.

Полная продуктовая спецификация: [`GAME_DEMO_SPEC.md`](./GAME_DEMO_SPEC.md).
