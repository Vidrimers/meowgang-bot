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
http://{SERVER_IP}:{PORT}/auth/youtube/callback
http://{SERVER_IP}:{PORT}/auth/instagram/callback
http://{SERVER_IP}:{PORT}/auth/tiktok/callback
```

Эти URL нужно добавить в настройки OAuth-приложений на соответствующих платформах.

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
