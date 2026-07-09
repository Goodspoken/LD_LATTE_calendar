---
name: ecosystem-guide
description: Home infrastructure guide - machines, Docker, Syncthing, deploy processes, and agent permissions. Use when deploying, connecting to servers, managing Docker containers, or working with infrastructure.
---

# 🏠 Home Ecosystem Guide

Этот документ описывает домашнюю инфраструктуру, пути синхронизации, разрешения и процессы деплоя. **Прочти его полностью перед началом работы.**

## 🖥️ Машины и их роли

### 1. Gamebox (`192.168.1.11`)
- **ОС:** Windows 11 Pro
- **Роль:** Основная рабочая станция, управление AI-агентами
- **Пути:**
  - `D:\safe\Serverbook\ai\` — центральное хранилище AI-инструментов (AnythingLLM, Antigravity skills)
  - `D:\safe\Projects\` — проекты (синхронизируется через Syncthing)
- **Docker Desktop:** Запущены локальные контейнеры (AnythingLLM на порту 3001)

### 2. Nicolas (`192.168.1.12`)
- **ОС:** Windows 11 Pro (ноутбук Dell)
- **Роль:** Мобильная рабочая станция
- **Пути:** Аналогичны Gamebox, но на диске `C:\`
- **Синхронизация:** Полная двусторонняя синхронизация с Gamebox через Syncthing

### 3. Serverbook (`192.168.1.2`)
- **ОС:** Ubuntu Server 24.04 LTS
- **Роль:** Центральный сервер, хостинг сервисов
- **Пути:**
  - `/srv/storage/Projects/` — проекты (синхронизируется с Windows-машинами)
  - `/srv/storage/Serverbook/` — конфиги серверных сервисов
  - `/home/illz/docker/` — Docker-композиции инфраструктурных сервисов
  - `/home/illz/projects/` — собственные разработки и боты
- **Доступ:** SSH по ключу (`illz@192.168.1.2`)

## 🐳 Docker и удалённая разработка

### Локальный Docker (Gamebox/Nicolas)
- **AnythingLLM:** `localhost:3001` (контейнер `anythingllm`)
- **Управление:** Стандартные команды `docker` в PowerShell

### Удалённый Docker (Serverbook)
- **Подключение с Gamebox:**
  ```powershell
  # Переключить контекст Docker на сервер
  docker context use serverbook
  
  # Вернуться к локальному Docker
  docker context use default
  ```
- **Контейнеры на Serverbook:**
  - `adguardhome` (DNS, порт 53/3001)
  - `motioneye` (видеонаблюдение, порт 8765)
  - `nextcloud` (облако, порт 8080)
  - `syncthing` (синхронизация, порт 8384)
  - `torrserver` (медиа, порт 8090)
  - `dashboard` (панель управления, порт 8089)

### Песочница для AI-агента (Antigravity)
- **Контейнер:** `ai-dev-box` (запущен на Serverbook)
- **Доступ из VS Code:** Через расширение "Antigravity IDE"
- **Монтирования:**
  - `/srv/storage/Projects/` → `/home/vscode/projects`
  - `/srv/storage/Serverbook/services/` → `/home/vscode/services`

## 📂 Syncthing — синхронизация данных

### Основные папки
| Локальный путь (Windows) | Путь на Serverbook | Назначение |
|--------------------------|-------------------|------------|
| `D:\safe\Projects\` | `/srv/storage/Projects/` | Активные проекты, код, заметки Obsidian |
| `D:\safe\Serverbook\` | `/srv/storage/Serverbook/` | Конфиги, бэкапы, AI-инструменты |

### Важные исключения (Игнор-листы)
Следующие паттерны **не синхронизируются**:
```
**/.git/**
**/node_modules/**
**/venv/**
**/.agents/skills/**
**/data-roaming/*Cache*/
**/data-roaming/logs
**/data-roaming/Crashpad
```

## 🔐 Разрешения и безопасность

### Что агент МОЖЕТ делать:
1. **Чтение/запись** в папки проектов (локально и на сервере)
2. **Запускать команды** в контейнере `ai-dev-box`
3. **Редактировать конфиги** в `~/docker/` на Serverbook (через SSH)
4. **Управлять Docker-контейнерами** (локально и удалённо через контексты)
5. **Создавать симлинки** для подключения навыков

### Что агент НЕ ДОЛЖЕН делать:
1. **Удалять** папки синхронизации
2. **Менять права доступа** на системные файлы Serverbook
3. **Отключать** сетевые сервисы (AdGuard, WireGuard)
4. **Редактировать** файлы в папках исключений Syncthing

### Симлинки для навыков (Skills)
- **Центральное хранилище:** `Serverbook/ai/antigravity/antigravity-skills/skills/`
- **Симлинки в проектах:** Папка `.agents/skills` → ссылка на центральное хранилище
- **Установка публичных навыков:**
  ```bash
  npx skills-sh@latest install <skill-name>
  ```

## 🚀 Деплой ботов на Serverbook

### Стандартный процесс
1. **Разработка** в песочнице `ai-dev-box` или локально на Windows
2. **Тестирование** в изолированном окружении
3. **Деплой** через Docker Compose:

```bash
# На Serverbook в папке проекта
cd /home/illz/projects/my-bot

# Создать docker-compose.yml
# Запустить
docker-compose up -d

# Проверить логи
docker-compose logs -f
```

### Структура типичного бота
```
my-bot/
├── src/                    # Исходный код
├── Dockerfile             # Конфигурация образа
├── docker-compose.yml     # Оркестрация
├── .env.example          # Переменные окружения
└── README.md             # Документация
```

### Мониторинг деплоя
- **Панель управления:** `http://192.168.1.2:8089`
- **Логи в реальном времени:** `docker-compose logs -f`
- **Проверка здоровья:** `docker ps` или `lazydocker`

## 🌐 Сетевая архитектура, порты и домены

Для развертывания новых веб-сервисов (фронтенд/бэкенд) ИИ-агенты должны сверяться с текущей картой занятых портов, чтобы исключить конфликты, и использовать правильные настройки SSH-доступов.

### 1. Карта портов Serverbook (Домашний сервер `192.168.1.2`)
* **`8089`** — Ecosystem Dashboard API (Node.js)  
* **`8080`** — Nextcloud (Docker)  
* **`8501`** — Job Hunter Dashboard/Bot (Docker)  
* **`8502`** — Partner Finder Dashboard/Bot (Docker)  
* **`8503`** — Caddy `gsk-caddy` (перенаправление на `gsk-frontend:3000`)  
* **`8505`** — Claytablet Frontend (Caddy Docker)  
* **`8506`** — Autogarden Dashboard (Docker)  
* **`8555`** — Локальный прокси / API-проброс  
* **`8000`** — Резерв под FastAPI  
* **`3000`** — Разработка / Frontend Dev Server  
* **`5432`** — PostgreSQL (Docker)  
* **`6379`** — Redis (Docker)  
* **`10801` — `10803`** — SOCKS5-туннели (Ihor, Clouvider, Docker)  
* **`22000`, `8384`** — Syncthing (Синхронизация)  
* **`53`** — AdGuard Home (DNS-фильтрация)  
* **`22`** — SSH-сервер (Хост)  

### 2. Карта портов удаленных узлов

#### VPS-1 (Ihor — `95.214.8.10`)
* **`2201`** — SSH-порт (вход для `admin` по ключу `id_ed25519`)  
* **`80`, `443`** — Caddy — проксирует домен `gskinfo.ru` на Serverbook (`port 8503`)  
* **`2053`** — 3X-UI панель (закрыта, доступ через VPN)  
* **`10443`** — Xray VLESS Reality (клиентские прокси)  
* **`8443`** — MTProto Rust proxy (`telemt`)  
* **`8444`** — MTProto Zig proxy (`mtproto.zig`)  

#### VPS-2 (Clouvider — `213.255.246.146`)
* **`2203`** — SSH-порт (вход для `illz` по ключу `id_ed25519`)  
* **`80`, `443`** — Caddy — проксирует домен `claytablet.online`  
* **`2053`** — 3X-UI панель ( Reality)  
* **`30443`** — Xray VLESS Reality (актуальный порт)  
* **`8555`** — Claytablet Backend API  
* **`8443`** — WhatsApp proxy  
* **`8444`** — MTProto proxy  
* **`8445`** — Nginx FakeTLS (`rutube.ru`)  
* **`53/udp`** — AmneziaWG VPN (актуальный порт)  

### 3. SSH-алиасы и доступы в песочнице
Внутри песочницы настроен файл конфигурации `~/.ssh/config`. Для подключения к серверам или GitHub используйте алиасы:
* `ssh serverbook` (домашний сервер)
* `ssh ihor` (финский VPN-хаб)
* `ssh clouvider` (британский Reality/VPN сервер)
* `ssh github.com` (для Git)

Все подключения выполняются с использованием ключа `~/.ssh/id_ed25519`.

---

## 🔧 Аварийное восстановление

### Если Antigravity не видит навыки:
```powershell
# Проверить симлинк
Get-Item "C:\Users\happy\.antigravity_tools\antigravity-skills" | Select-Object LinkType, Target

# Пересоздать симлинк
Remove-Item -Path "C:\Users\happy\.antigravity_tools\antigravity-skills" -Force
New-Item -ItemType SymbolicLink -Path "C:\Users\happy\.antigravity_tools\antigravity-skills" -Target "C:\Users\happy\Serverbook\ai\antigravity\antigravity-skills"
```

### Если нет доступа к Serverbook:
```bash
# Проверить SSH-ключи
ssh -T illz@192.168.1.2

# Проверить сеть
ping 192.168.1.2
```

### Если Docker-контекст не работает:
```powershell
# Пересоздать контекст
docker context create serverbook --docker "host=ssh://illz@192.168.1.2"
docker context use serverbook
```

---

**Запомни:** Все изменения в центральных папках автоматически синхронизируются между машинами. Работай в любом месте — система обеспечит консистентность.
