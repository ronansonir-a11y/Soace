# 🛰 AETHER-6

**Автономно спроектированный и собранный 6DoF космический симулятор** по «Системной
Директиве AETHER-6»: от архитектуры до играбельного билда — кодом, без ручной сборки сцен.

![stack](https://img.shields.io/badge/Three.js-WebGL-black) ![ts](https://img.shields.io/badge/TypeScript-strict-blue) ![tests](https://img.shields.io/badge/tests-14%20vitest-green) ![android](https://img.shields.io/badge/Android-APK%20(CI)-green)

## ▶ Играть

- **Браузер:** локально/в превью `npm run dev` · GitHub Pages: один раз включить
  **Settings → Pages → Source: GitHub Actions** (у CI-токена нет прав включить самому) —
  после этого каждый пуш сам публикует игру; job `build` (тесты+сборка) уже зелёный.
- **Android:** 📦 **[AETHER-6.apk из релиза v1.0.0](../../releases/tag/v1.0.0)** (591 КБ, собран CI) — ставится на любой
  Android 7+ (debug-подпись), интернет игре не нужен: весь билд зашит в `assets/www` и отдаётся
  WebView через `WebViewAssetLoader`.

## 🕹 Управление

| Клавиша | Действие | Клавиша | Действие |
|---|---|---|---|
| Мышь | обзор (клик по экрану — захват) | Space / X | лазеры / автопушки |
| W/S, A/D, R/F | тяга, стрейф, вверх/вниз | C | ракета (нужен захват 2 с) |
| Q | крен | V | Flight Assist ON/OFF |
| Shift | буст (до 300 м/с) | B | круизный двигатель (зарядка 3 с) |
| Tab | смена цели | G / T | майнинг-лазер / тракторный луч |
| E | стыковка со станцией (<110 м, <30 м/с) | M | карта варп-прыжков (50 систем) |
| Стрелки ↑→↓ | энергия ENG / WEP / SYS | 📱 Телефон | левый стик + кнопки ОГОНЬ/РАКЕТА/БУСТ/СТЫК, обзор — свайп правой половиной |

## 🏗 Архитектура (Code-First, все сцены — кодом)

```
/src/Core        EventBus, RNG (seed), FloatingOrigin (>5000 м — пересчёт кадра)
/src/Physics     PIDController (Flight Assist), 6DoF: тяга/стрейф/крен, 3 режима скорости
/src/ProcGen     Galaxy: 50 связанных систем (остовное дерево + соседи), планеты, пояса,
                 ProceduralShipMeshGenerator (корабли/станции из примитивов + эмиссия)
/src/Combat      Lead Target (квадратичное упреждение), ObjectPool×500 снарядов, ракеты (PropNav + ловушки),
                 щиты с шейдерной волной от точки удара, урон модулей (двигатель от кормовых попаданий)
/src/AI          FSM Patrol→Scan→Intercept→Dogfight→Evade(<20%)→Flee, Steering + «усы» от астероидов,
                 торговцы реально возят груз пояс↔станция
/src/Economy     Живой рынок (цена от спроса/запаса), трюм, апгрейды, процедурные контракты
/src/Shaders     Корона звезды, атмосфера (fresnel-рассеивание), щит (hex-волна), варп-туннель
/src/Audio       Процедурный WebAudio: гул реактора от тяги, лазеры, взрывы + TTS бортового компьютера
/tests           14 vitest: физика/PID, упреждение, пул, экономика, FSM, связность галактики, Floating Origin
/android         Нативный WebView-контейнер (Java, без единого игрового ассета вне веба)
/.github/workflows  build.yml (тесты→билд→GitHub Pages) · android.yml (тесты→билд→APK→Release)
```

Отступления от директивы (сознательные): физика — собственный ньютоновский интегратор вместо
Rapier WASM (детерминирована в тестах, не требует WASM на слабых WebView); масштаб пояса —
3–7 тыс. инстансов астероидов на систему (мобильный FPS), коллизии — только у ближайших.

## ✅ Автотесты и CI

`npm test` — 14 тестов · `npm run build` — строгий `tsc` + Vite.
Каждый пуш: **Web build + tests (Pages)** и **Android APK** (артефакт `AETHER-6.apk`, при ручном
запуске — ещё и релиз в GitHub Releases).

## 🛠 Разработка

```bash
npm install && npm run dev   # http://localhost:5173
npm test                     # vitest
npm run build                # dist/ (это же зашивается в APK)
```

Сид вселенной меняется в меню запуска — одна строка = одна детерминированная галактика из 50 систем.
