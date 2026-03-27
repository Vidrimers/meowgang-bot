# Video Upload Bot

Telegram-бот для автоматической публикации видео в YouTube, Instagram Reels и TikTok.

## Стек

- **Runtime:** Node.js LTS + TypeScript
- **Bot:** Telegraf
- **Database:** PostgreSQL + Drizzle ORM
- **Queue:** Redis + BullMQ
- **HTTP Server:** Fastify
- **Logging:** pino

## Быстрый старт

### 1. Установить зависимости

```bash
npm install
```

### 2. Настроить окружение

```bash
cp .env.example .env
```

Заполнить все обязательные переменные в `.env` (см. комментарии в файле).

### 3. Применить миграции БД

```bash
npm run db:generate
npm run db:migrate
```

### 4. Запустить

```bash
# Разработка
npm run dev

# Продакшн
npm run build
npm start
```

## Переменные окружения

Все переменные описаны в `.env.example` с комментариями.

Обязательные переменные:

| Переменная | Описание |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather |
| `TELEGRAM_ADMIN_ID` | Telegram ID администратора |
| `DATABASE_URL` | URL подключения к PostgreSQL |
| `REDIS_URL` | URL подключения к Redis |
| `YOUTUBE_CLIENT_ID` | OAuth Client ID (Google Console) |
| `YOUTUBE_CLIENT_SECRET` | OAuth Client Secret (Google Console) |
| `INSTAGRAM_CLIENT_ID` | App ID (Meta for Developers) |
| `INSTAGRAM_CLIENT_SECRET` | App Secret (Meta for Developers) |
| `TIKTOK_CLIENT_ID` | Client Key (TikTok for Developers) |
| `TIKTOK_CLIENT_SECRET` | Client Secret (TikTok for Developers) |
| `TOKEN_ENCRYPTION_KEY` | Hex-ключ 64 символа для AES-256-GCM |
| `SERVER_IP` | IP сервера для OAuth callback URL |
| `PORT` | Порт HTTP-сервера |

## Redis

Redis используется как хранилище для очередей BullMQ (загрузка видео, сбор статистики).

**На сервере (Ubuntu/Debian):**
```bash
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```
В `.env`: `REDIS_URL=redis://localhost:6379`

**Для локальной разработки** — рекомендуется [Upstash](https://upstash.com/) (бесплатный облачный Redis). После создания базы используй URL вида `rediss://...` (с двумя `s` — TLS обязателен для Upstash).

## OAuth настройка

После запуска бота авторизуйте каждую платформу через команду `/start` → «Настройки аккаунтов».

Callback URL для каждой платформы:
```
https://твой-домен.com/auth/youtube/callback
https://твой-домен.com/auth/instagram/callback
https://твой-домен.com/auth/tiktok/callback
```

Эти URL нужно добавить в настройки OAuth-приложений на соответствующих платформах.

### Требования к домену

Google, Meta и TikTok не принимают голые IP-адреса в redirect URI — нужен домен. Если у тебя есть домен с nginx, добавь проксирование `/auth/` на порт бота:

```nginx
location /auth/ {
    proxy_pass http://localhost:4198;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

После этого в `.env` укажи:
```
SERVER_URL=https://твой-домен.com
```

### YouTube (Google Cloud Console)

1. Зайди на [console.cloud.google.com](https://console.cloud.google.com)
2. Создай новый проект
3. APIs & Services → Enable APIs → найди **YouTube Data API v3** → Enable
4. APIs & Services → Credentials → Create Credentials → **OAuth client ID**
5. Сначала настрой **OAuth consent screen**: выбери External, заполни название и email
6. Application type: **Web application**
7. Authorized redirect URIs: `https://твой-домен.com/auth/youtube/callback`
8. Скопируй Client ID и Client Secret в `.env`

**Важно:** пока приложение в статусе Testing, нужно добавить свой Google аккаунт как тестового пользователя:
- OAuth consent screen → **Audience** → Test users → Add users → добавь свой Gmail

### Instagram (Meta for Developers)

1. Зайди на [developers.facebook.com](https://developers.facebook.com)
2. My Apps → Create App → выбери тип **Business**
3. Панель → "Добавить сценарии использования" → найди **"Управление сообщениями и контентом в Instagram"** → добавь
4. Настройки приложения → Основное:
   - Заполни **URL Политики конфиденциальности** (например `https://твой-домен.com/privacy`)
   - Выбери **Категорию**
   - Сохрани изменения
5. Сценарии использования → Настройка → пункт **"Настройте вход в Instagram от имени компании"** → нажми "Настроить" → добавь redirect URI: `https://твой-домен.com/auth/instagram/callback`
6. Роли в приложении → Роли → добавь свой Instagram аккаунт как **Тестировщик Instagram** → прими приглашение в Instagram (Настройки → Приложения и сайты)
7. В настройках приложения скопируй **ID приложения Instagram** (не Facebook App ID!) и **Секрет приложения Instagram** в `.env`:
   ```
   INSTAGRAM_CLIENT_ID=ID_приложения_Instagram
   INSTAGRAM_CLIENT_SECRET=секрет_приложения
   ```

**Важно:** нужен Instagram Professional аккаунт (Business, не Creator). Переключить: Настройки Instagram → Аккаунт → Переключиться на профессиональный аккаунт → Business. Привязка к Facebook странице не обязательна для тестирования.

**Важно:** `INSTAGRAM_CLIENT_ID` — это именно **ID приложения Instagram** из раздела "Настройка API для входа в Instagram", а не общий Facebook App ID. Они разные.

### TikTok (TikTok for Developers)

1. Зайди на [developers.tiktok.com](https://developers.tiktok.com)
2. Для входа нужен TikTok аккаунт с email — если логинился через Google, добавь email в приложении TikTok: Профиль → Управление аккаунтом → Добавить email
3. Manage Apps → Create App → выбери **Individual**
4. Заполни обязательные поля: App icon (любое фото 1024x1024), App name, Category, Description, Terms of Service URL, Privacy Policy URL (можно указать свой домен)
5. Platform → выбери **Web**, укажи свой домен → нажми **Verify URL properties** → Domain → введи домен → добавь TXT запись в DNS
6. Products → добавь **Login Kit** и **Content Posting API**
7. В Login Kit → Redirect URI → Web → добавь: `https://твой-домен.com/auth/tiktok/callback`
8. В Content Posting API → включи **Direct Post** (иначе видео будет загружаться как черновик)
9. Scopes → добавь `video.upload`, `video.publish`, `user.info.stats`
10. App review → заполни описание интеграции и загрузи демо-видео → Submit for review

**Важно:** в описании для App Review **не пиши** что это личный бот или для внутреннего использования — TikTok отклоняет такие заявки. Позиционируй как публичный сервис для контент-мейкеров. Пример описания:
> myMeowGang is a web platform that enables content creators to upload and publish videos to TikTok using the Content Posting API. Users authenticate via Login Kit, upload videos with metadata (title, description, tags), and publish directly to their TikTok accounts via video.upload and video.publish scopes.

11. После одобрения (несколько рабочих дней) скопируй **Client Key** и **Client Secret** в `.env`

**Важно:** без одобрения App Review публикация видео через API работать не будет.

## Тесты

```bash
npm test
```

## Деплой на сервер

```bash
# Собрать
npm run build

# Запустить (рекомендуется через pm2)
pm2 start dist/index.js --name video-upload-bot
```
