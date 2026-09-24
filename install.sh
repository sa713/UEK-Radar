#!/usr/bin/env bash
set -Eeuo pipefail

# Run as root from an unpacked project, or use the self-contained .run bundle.
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install_dir="${UEK_INSTALL_DIR:-/opt/uek-radar}"
keys_file="${UEK_KEYS_FILE:-/etc/uek-radar/keys.env}"

fail() { printf 'Ошибка: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Запустите установщик через sudo.'
[[ -f "$source_dir/compose.yaml" && -f "$source_dir/Dockerfile" ]] || fail 'В пакете нет файлов проекта.'
command -v openssl >/dev/null || fail 'Не найдена команда openssl'
[[ "$install_dir" = /* && "$keys_file" = /* ]] || fail 'Пути установки должны быть абсолютными.'
[[ "$install_dir" != / && "$keys_file" != / ]] || fail 'Корневой каталог нельзя использовать для установки.'

ask_username() {
 local answer
 while :; do
  read -r -p 'Telegram username администратора (без @): ' answer
  answer="${answer#@}"
  if [[ "$answer" =~ ^[A-Za-z0-9_]{5,32}$ ]]; then printf '%s' "${answer,,}"; return; fi
  printf 'Укажите username Telegram длиной от 5 до 32 символов.\n' >&2
 done
}

if [[ ! -e "$keys_file" ]]; then
 [[ -t 0 ]] || fail 'Для первой установки нужен интерактивный ввод настроек.'
 read -r -p 'Домен радара (например radar.example.org): ' domain
 [[ "$domain" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$ ]] || fail 'Некорректный домен.'
 read -r -p 'Username Telegram-бота (без @): ' bot_username
 bot_username="${bot_username#@}"
 [[ "$bot_username" =~ ^[A-Za-z0-9_]{5,32}$ ]] || fail 'Некорректный username бота.'
 admin_username="$(ask_username)"
 read -r -s -p 'Новый токен Telegram-бота: ' bot_token; printf '\n'
 [[ "$bot_token" =~ ^[0-9]{8,12}:[A-Za-z0-9_-]{30,}$ ]] || fail 'Некорректный токен Telegram.'
 read -r -s -p 'Ключ OpenAI API: ' openai_key; printf '\n'
 [[ -n "$openai_key" && "$openai_key" != *$'\n'* ]] || fail 'Ключ OpenAI API обязателен.'
 install -d -m 700 -- "$(dirname -- "$keys_file")"
 umask 077
 temp_keys="$(mktemp "${keys_file}.XXXXXX")"
 trap '[[ -z "${temp_keys:-}" ]] || rm -f -- "$temp_keys"' EXIT
 {
  printf 'DOMAIN=%s\nSITE_ORIGIN=https://%s\n' "$domain" "$domain"
  printf 'TELEGRAM_BOT_USERNAME=%s\nTELEGRAM_BOT_TOKEN=%s\n' "$bot_username" "$bot_token"
  printf 'ADMIN_TELEGRAM_USERNAME=%s\n' "$admin_username"
  printf 'SESSION_SECRET=%s\nCRON_SECRET=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)"
  printf 'OPENAI_API_KEY=%s\n' "$openai_key"
 } > "$temp_keys"
 chmod 600 "$temp_keys"
 chown root:root "$temp_keys"
 mv -f -- "$temp_keys" "$keys_file"
 temp_keys=''
 unset bot_token openai_key
else
 [[ -f "$keys_file" && ! -L "$keys_file" ]] || fail 'Файл ключей должен быть обычным файлом, не ссылкой.'
 if ! grep -Eq '^ADMIN_TELEGRAM_USERNAME=[A-Za-z0-9_]{5,32}$' "$keys_file"; then
  [[ -t 0 ]] || fail 'В key-файле нет ADMIN_TELEGRAM_USERNAME; нужен интерактивный ввод.'
  admin_username="$(ask_username)"
  umask 077
  temp_keys="$(mktemp "${keys_file}.XXXXXX")"
  trap '[[ -z "${temp_keys:-}" ]] || rm -f -- "$temp_keys"' EXIT
  awk '!/^ADMIN_TELEGRAM_USERNAME=/' "$keys_file" > "$temp_keys"
  printf 'ADMIN_TELEGRAM_USERNAME=%s\n' "$admin_username" >> "$temp_keys"
  chmod 600 "$temp_keys"; chown root:root "$temp_keys"
  mv -f -- "$temp_keys" "$keys_file"
  temp_keys=''
 fi
 chmod 600 "$keys_file"; chown root:root "$keys_file"
fi


parent_dir="$(dirname -- "$install_dir")"
install -d -m 755 -- "$parent_dir"
stage="$(mktemp -d "${parent_dir}/.uek-radar-stage.XXXXXX")"
trap '[[ -z "${stage:-}" ]] || rm -rf -- "$stage"' EXIT
for item in app components db deploy drizzle hooks lib public scripts vendor worker; do cp -a -- "$source_dir/$item" "$stage/"; done
for item in .dockerignore .gitignore .npmrc ARCHITECTURE.md Dockerfile README.md compose.yaml components.json eslint.config.mjs next.config.ts package.json pnpm-lock.yaml pnpm-workspace.yaml postcss.config.mjs tsconfig.json install.sh; do cp -a -- "$source_dir/$item" "$stage/"; done
if [[ -d "$install_dir" ]]; then
 backup="${install_dir}.previous.$(date +%Y%m%d%H%M%S).$$"
 mv -- "$install_dir" "$backup"
 printf 'Предыдущая версия сохранена: %s\n' "$backup"
fi
mv -- "$stage" "$install_dir"
stage=''
printf '\nПроект установлен в %s. Контейнеры не запущены.\n' "$install_dir"
printf 'Конфигурация: %s (права 0600, вне проекта)\n' "$keys_file"
printf 'Настройте порт и обратный прокси на сервере перед ручным запуском. Инструкции: %s/README.md\n' "$install_dir"
