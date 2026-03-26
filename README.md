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
2. My Apps → Create App → Business
3. Добавь продукт **Instagram Graph API**
4. App Settings → Basic → скопируй App ID и App Secret
5. Instagram → Settings → добавь redirect URI: `https://твой-домен.com/auth/instagram/callback`
6. Запроси разрешения: `instagram_basic`, `instagram_content_publish`

**Важно:** нужен Instagram Professional аккаунт (Creator или Business), привязанный к Facebook странице.

### TikTok (TikTok for Developers)

1. Зайди на [developers.tiktok.com](https://developers.tiktok.com)
2. Manage Apps → Create App
3. Products → Login Kit → добавь redirect URI: `https://твой-домен.com/auth/tiktok/callback`
4. Products → Content Posting API → подай заявку на доступ (рассматривается несколько дней)
5. Скопируй Client Key и Client Secret из App Detail

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
