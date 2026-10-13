# Охрана труда

Web-приложение для автоматизации охраны труда на предприятии (ориентир — около 2000 сотрудников):
единый реестр сотрудников, инструктажи, проверки знаний, учёт СИЗ, календарь, задачи и уведомления,
отчёты и печатные формы. Приоритетная юрисдикция — Республика Беларусь; нормативные сроки **не зашиты в код**
и задаются в справочниках правил с основанием и периодом действия.

| Компонент | Технологии |
|---|---|
| Backend | NestJS 11, TypeScript, Prisma 6, PostgreSQL 16, JWT (access + refresh с ротацией), Swagger |
| Frontend | React 18, TypeScript, Vite, Ant Design 5 (русская локаль), TanStack Query |
| Экспорт | XLSX (exceljs), CSV, PDF (pdfmake), печать HTML по настраиваемым шаблонам |
| Развёртывание | Docker Compose: PostgreSQL, backend, nginx, автоматическое резервное копирование, Caddy (HTTPS) |

## Быстрый старт (Docker)

```bash
cp .env.example .env          # задайте POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
docker compose up -d --build  # миграции и базовые справочники применяются автоматически
docker compose exec backend node dist/scripts/create-admin.js --login admin --name "Иванов И.И."
```

Откройте `http://localhost:8080` (порт — `HTTP_PORT`). Документация API: `http://localhost:8080/api/docs`.
Подробно: [docs/INSTALL.md](docs/INSTALL.md), эксплуатация, HTTPS, резервное копирование и обновление —
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Локальная разработка

```bash
# PostgreSQL 16 должен быть доступен; строка подключения — в backend/.env
cd backend && cp .env.example .env && npm ci
npx prisma migrate dev          # схема БД
npm run seed:dev -- --reset     # ТЕСТОВЫЕ данные: 2000 вымышленных сотрудников, пользователи всех ролей
npm run start:dev               # API на :3000

cd ../frontend && npm ci && npm run dev   # интерфейс на :5173 (прокси /api → :3000)
```

Тестовые пользователи (только `seed:dev`): `admin`, `specialist`, `head`, `hr`, `ppe`, `auditor`,
пароль `DevPassword2024` (или значение `DEV_PASSWORD`). Тестовые правила и нормы помечены
«ТЕСТОВЫЕ ДАННЫЕ — не является нормативом».

## Тесты

```bash
cd backend && npm test                                            # unit: правила сроков, СИЗ, импорт, безопасность
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/postgres npm run test:e2e   # API на реальной PostgreSQL
cd frontend && npm test                                           # Vitest + Testing Library
```

e2e-тесты создают временную БД `ot_e2e_<время>` и удаляют её после прогона (нужно право CREATEDB);
существующие базы не затрагиваются.

## Документация

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — архитектура, модули, схема БД, API, сценарии, критерии приёмки
- [docs/INSTALL.md](docs/INSTALL.md) — установка и первый администратор
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — HTTPS, резервное копирование и восстановление, обновление, безопасность
- [docs/REGULATORY.md](docs/REGULATORY.md) — нормативное соответствие (Республика Беларусь) и порядок настройки правил
- [docs/STATUS.md](docs/STATUS.md) — что реализовано, ограничения и оставшиеся задачи
