#!/bin/bash

# Configuration
CLOUVIDER_SSH="illz@213.255.246.146 -p 2203"
IHOR_SSH="admin@95.214.8.10 -p 2201"
SERVERBOOK_SSH="illz@192.168.1.2" # Local Serverbook SSH

echo "=== Настройка деплоя бэкенда LD Latte ==="
echo "Выберите сервер для развёртывания:"
echo "1) Serverbook (Локальный сервер, порт 8507)"
echo "2) Clouvider (Удалённый сервер UK, порт 8000)"
echo "3) Ihor (Удалённый сервер, порт 8000)"
read -p "Введите номер варианта (1-3): " option

case $option in
    1)
        TARGET="Serverbook"
        SSH_CONN=$SERVERBOOK_SSH
        PORT=8507
        REMOTE_DIR="/home/illz/projects/calendar"
        ;;
    2)
        TARGET="Clouvider"
        SSH_CONN=$CLOUVIDER_SSH
        PORT=8000
        REMOTE_DIR="/home/illz/projects/calendar"
        ;;
    3)
        TARGET="Ihor"
        SSH_CONN=$IHOR_SSH
        PORT=8000
        REMOTE_DIR="/home/admin/projects/calendar"
        ;;
    *)
        echo "Неверный вариант. Выход."
        exit 1
        ;;
esac

echo "Подготовка деплоя на $TARGET..."

# Разделяем хост и опции порта для SSH
SSH_HOST=$(echo $SSH_CONN | awk '{print $1}')
SSH_PORT_OPT=$(echo $SSH_CONN | cut -d' ' -f2-)

# Если порт не указан, убираем лишнее
if [ "$SSH_HOST" = "$SSH_CONN" ]; then
    SSH_PORT_OPT=""
fi

# Создаем папку на сервере
echo "Создание директории $REMOTE_DIR на $TARGET..."
ssh $SSH_PORT_OPT $SSH_HOST "mkdir -p $REMOTE_DIR"

# Копируем бэкенд и docker-compose.yml
echo "Копирование файлов..."
rsync -avz -e "ssh $SSH_PORT_OPT" --exclude 'venv' --exclude '__pycache__' --exclude 'meetings.db' ./backend ./docker-compose.yml $SSH_HOST:$REMOTE_DIR/

# Запуск Docker Compose на целевом сервере
echo "Запуск сервиса на $TARGET..."
if [ "$TARGET" = "Serverbook" ]; then
    # Подменяем порт 8000:8000 на 8507:8000 для Serverbook
    ssh $SSH_PORT_OPT $SSH_HOST << EOF
    cd $REMOTE_DIR
    echo "Бэкап базы данных из контейнера..."
    docker cp calendar_backend:/app/meetings.db ./backend/meetings.db || true
    echo "Сборка и запуск бэкенда через Docker Compose..."
    docker compose down
    # Удаляем старый named volume, если он существует, чтобы очистить кэш
    docker volume rm calendar_db-data 2>/dev/null || true
    sed -i 's/8000:8000/8507:8000/g' docker-compose.yml
    docker compose up -d --build
EOF
else
    ssh $SSH_PORT_OPT $SSH_HOST "cd $REMOTE_DIR && docker compose up -d --build"
fi

echo "============================================="
echo "🎉 Деплой бэкенда на $TARGET успешно завершён!"
if [ "$TARGET" = "Serverbook" ]; then
    echo "Бэкенд доступен по адресу: http://192.168.1.2:8507"
elif [ "$TARGET" = "Clouvider" ]; then
    echo "Бэкенд доступен по адресу: http://213.255.246.146:8000"
else
    echo "Бэкенд доступен по адресу: http://95.214.8.10:8000"
fi
echo "============================================="
