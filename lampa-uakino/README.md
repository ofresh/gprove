# UAKino → Lampa: онлайн-перегляд і торенти

Парсер **uakino.best** і плагін для **Lampa**. На картці фільму/серіалу з'являються дві кнопки:

- **UAKino** — онлайн-перегляд прямо з сайту, як online_mod: вибір сезону (сторінки) й озвучки,
  список серій, якість (480p/720p/1080p), субтитри, плейлист серій і збереження прогресу перегляду;
- **UAKino торенти** — торенти uakino.best, запуск через TorrServer.

- `server.js` — парсер з Jackett-сумісним API. Шукає матеріали на uakino, знаходить на сторінках
  посилання `https://uakino.best/torrent/<id>/<назва>.torrent`, завантажує .torrent, рахує infohash
  і віддає magnet, розмір, кількість файлів і сіди/піри (через scrape трекерів).
- `plugin/uakino.js` — плагін Lampa: кнопка **UAKino** на картці фільму/серіалу зі списком торентів
  цього сайту, запуск через TorrServer.
- `worker/dist/worker.mjs` — та сама логіка одним файлом для Cloudflare Workers.
- `node server.js crawl` — обхід **усього сайту** (sitemap або сторінки списку) і збереження всіх
  торентів у локальний індекс `data/index.json`.

Сторонніх залежностей немає. Можна розгорнути безкоштовно на Cloudflare Workers або запустити вдома (Node.js 18+).

## Швидкий старт без комп'ютера — Cloudflare Workers (безкоштовно)

Парсер працює в мережі Cloudflare цілодобово, нічого запускати вдома не потрібно.

1. Зареєструйтесь на <https://dash.cloudflare.com/sign-up> (безкоштовно, без картки).
2. Зліва **Compute (Workers)** → **Workers & Pages** → **Create** → **Create Worker**
   (шаблон «Hello World»). Назвіть, наприклад, `uakino-lampa` → **Deploy**.
3. Натисніть **Edit code**, видаліть увесь код у редакторі й вставте вміст файлу
   [`worker/dist/worker.mjs`](worker/dist/worker.mjs) (на GitHub: кнопка **Raw** → виділити все → скопіювати).
   Натисніть **Deploy**.
4. Відкрийте в браузері `https://uakino-lampa.<ваш-піддомен>.workers.dev/` — має з'явитися JSON
   зі словом `uakino-torrents`. Перевірка пошуку:
   `https://uakino-lampa.<піддомен>.workers.dev/api/v2.0/indexers/all/results?Query=Високий%20потенціал`
5. У Lampa → Налаштування → Розширення → Додати плагін:
   `https://uakino-lampa.<піддомен>.workers.dev/uakino.js`

Додатково (Worker → Settings → Variables): `UAKINO_HOST` (дзеркало сайту), `UAKINO_APIKEY`,
`UAKINO_COOKIE`/`UAKINO_UA`.

Обмеження Worker-версії: до 30 торентів на пошук (ліміт безкоштовного плану), сіди/піри не
рахуються (у Workers немає UDP), обходу всього сайту (`crawl`) немає — для цього є Node-версія нижче.
Якщо Worker отримує від uakino `403 (Cloudflare заблокував запит)`, сайт відсіює і такі запити —
тоді лишається Node-версія вдома або на іншому хостингу.

**Автооновлення.** Workflow `.github/workflows/uakino-worker.yml` проганяє тести і, якщо в репозиторії
є секрети `CLOUDFLARE_API_TOKEN` і `CLOUDFLARE_ACCOUNT_ID`, сам розгортає Worker після змін у `main`.
Після змін у `lib/` чи `plugin/` перезберіть файл: `node worker/build.js`.

## Запуск на своєму комп'ютері / сервері (Node.js)

```bash
cd lampa-uakino
node server.js            # http://0.0.0.0:9118
```

> **Cloudflare.** uakino.best закритий Cloudflare, який блокує запити з дата-центрів і VPS
> (там буде `HTTP 403`). Запускайте парсер **вдома**: на ПК, NAS, роутері або Android-приставці
> з Termux, у тій самій мережі, що й телевізор з Lampa.
> Якщо Cloudflare показує перевірку і вдома, відкрийте сайт у браузері, скопіюйте cookie `cf_clearance`
> і User-Agent цього браузера та передайте їх парсеру:
>
> ```bash
> UAKINO_COOKIE="cf_clearance=..." UAKINO_UA="Mozilla/5.0 ..." node server.js
> ```

## Підключення до Lampa

### Варіант 1 — плагін (кнопка «UAKino» на картці)

Lampa → Налаштування → Розширення → Додати плагін:

```
http://<IP-комп'ютера-з-парсером>:9118/uakino.js
```

Адреса парсера вже підставлена в плагін. Змінити її можна в розділі Налаштування → UAKino.
Для запуску торентів у Lampa має бути налаштований TorrServer.

### Варіант 2 — штатні «Торренти» Lampa (як Jackett)

Lampa → Налаштування → Парсер → «Використовувати парсер» → тип **Jackett**:

- Посилання: `http://<IP>:9118`
- API-ключ: будь-який (або значення `UAKINO_APIKEY`, якщо ви його задали)

Тоді торенти з uakino з'являтимуться у звичайній кнопці «Торренти». Цей самий endpoint
підходить для будь-якого клієнта, що вміє працювати з Jackett JSON API.

## Індекс усіх торентів сайту

```bash
node server.js crawl              # продовжує з місця зупинки
node server.js crawl --refresh    # перечитати всі сторінки
node server.js crawl --no-meta    # не завантажувати .torrent (швидше, але без magnet/розміру)
node server.js export             # data/torrents.json — плоский список усіх торентів
```

Коли індекс є, сервер спочатку шукає в ньому, а вже потім на сайті. Сторінки, відкриті під час
звичайних пошуків, теж потрапляють в індекс. Пауза між запитами задається `UAKINO_DELAY`
(мс, за замовчуванням 500). Не зменшуйте її сильно, щоб сайт вас не заблокував.

## API

| Запит | Опис |
| --- | --- |
| `GET /api/v2.0/indexers/all/results?Query=&title=&title_original=&year=` | Jackett JSON (`Results[]`: `Title`, `Size`, `Seeders`, `Peers`, `MagnetUri`, `Link`, `Details`, …) |
| `GET /online/search?title=&original=` | сторінки uakino, що відповідають фільму (сезони серіалу — окремі сторінки) |
| `GET /online/page?url=<сторінка uakino>` | серії й озвучки (`items[]`: `group`, `season`, `episode`, `title`, `url` або готовий `stream`) |
| `GET /online/stream?url=<плеєр ashdi>&referer=<сторінка>` | пряме посилання на відео: `{ url, quality, subtitles }` |
| `GET /download?url=<посилання на .torrent>` | віддає .torrent з uakino (лише `/torrent/*` цього сайту) |
| `GET /uakino.js` | плагін Lampa з підставленою адресою сервера |
| `GET /health` | стан і кількість сторінок в індексі |

Консольний пошук: `node server.js search "Високий потенціал"`.

## Налаштування (змінні оточення)

| Змінна | За замовчуванням | |
| --- | --- | --- |
| `PORT`, `BIND` | `9118`, `0.0.0.0` | адреса сервера |
| `UAKINO_HOST` | `https://uakino.best` | дзеркало сайту |
| `UAKINO_COOKIE`, `UAKINO_UA` | — | cookie і User-Agent браузера (для Cloudflare) |
| `UAKINO_APIKEY` | — | якщо задано, запити без цього ключа отримують 401 |
| `UAKINO_PUBLIC_URL` | з заголовка Host | зовнішня адреса для посилань `Link` |
| `UAKINO_INDEX` | `data/index.json` | файл індексу; `0` вимикає індекс |
| `UAKINO_MAX_PAGES` | `6` | скільки знайдених сторінок відкривати на один пошук |
| `UAKINO_SCRAPE` | `1` | `0` вимикає запит сідів/пірів у трекерів |

## Тести

```bash
node test/test.js
```

Тести піднімають локальну імітацію uakino з фікстурами (`test/fixtures`) і перевіряють розбір
пошуку й сторінок, bencode/infohash, Jackett API, `/download`, обхід сайту, а також роботу
плагіна в Chromium (з імітацією API Lampa, якщо встановлено Playwright).

Онлайн-відео uakino показує через плеєр ashdi.vip (Playerjs). Парсер бере з нього посилання
на m3u8, а відтворює його вже сам плеєр Lampa з вашої мережі.

Розмітку uakino відтворено за відомою структурою DLE-сайту. Перевірити її на живому сайті з
хмарного середовища не вдалося, бо Cloudflare його блокує. Якщо пошук нічого не знаходить, запустіть
`node server.js search "<назва>"` і подивіться лог: селектори зосереджені в `lib/parse.js`.

Користуйтеся відповідально, з дотриманням авторських прав і правил сайту.
