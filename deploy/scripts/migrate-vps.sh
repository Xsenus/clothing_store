#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/Xsenus/clothing_store.git}"
DEPLOY_REF="${DEPLOY_REF:-main}"
DOMAIN="${DOMAIN:-fashiondemon.shop}"

APP_DIR="${APP_DIR:-/opt/clothing_store}"
RUNTIME_DIR="${RUNTIME_DIR:-/opt/clothing_store_runtime/store-api}"
FRONTEND_DIST_DIR="${FRONTEND_DIST_DIR:-/var/www/clothing-store}"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-/etc/clothing-store/environment}"
LEGACY_ENV_FILE="${LEGACY_ENV_FILE:-/etc/clothing-store/api.env}"
LEGACY_ROOT_ENV_FILE="${LEGACY_ROOT_ENV_FILE:-/opt/clothing_store/.env}"
SERVICE_NAME="${SERVICE_NAME:-clothing-store-api}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SERVICE_DROPIN_DIR="/etc/systemd/system/${SERVICE_NAME}.service.d"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-clothing-store}"
NGINX_SITE_FILE="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
APP_USER="${APP_USER:-www-data}"
OLD_UPLOADS_DIR="${OLD_UPLOADS_DIR:-/opt/backend/uploads}"
NEW_UPLOADS_DIR="${NEW_UPLOADS_DIR:-${APP_DIR}/backend/uploads}"
BACKEND_HEALTHCHECK_URL="${BACKEND_HEALTHCHECK_URL:-http://127.0.0.1:3001/products}"

timestamp() {
  date +%Y%m%d-%H%M%S
}

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\n[ERROR] %s\n' "$1" >&2
  exit 1
}

backup_path() {
  local source_path="$1"
  if [[ -e "$source_path" || -L "$source_path" ]]; then
    mkdir -p "$BACKUP_DIR"
    cp -a "$source_path" "$BACKUP_DIR"/
  fi
}

read_env_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "$file_path" ]]; then
    return 1
  fi

  local line
  line="$(grep -m1 -E "^${key}=" "$file_path" || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  printf '%s\n' "${line#*=}"
}

first_non_empty() {
  local value
  for value in "$@"; do
    if [[ -n "${value:-}" ]]; then
      printf '%s\n' "$value"
      return 0
    fi
  done

  return 1
}

connection_value() {
  local key="$1"
  local segment

  IFS=';' read -r -a connection_segments <<<"$CONNECTION_STRING"
  for segment in "${connection_segments[@]}"; do
    if [[ "${segment%%=*}" == "$key" ]]; then
      printf '%s\n' "${segment#*=}"
      return 0
    fi
  done

  return 1
}

ensure_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Run this script as root."
  fi
}

ensure_required_tools() {
  log "Installing or updating required packages"

  apt-get update
  apt-get install -y git nginx postgresql postgresql-contrib rsync curl ca-certificates gnupg

  if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi

  if ! command -v dotnet >/dev/null 2>&1 || ! dotnet --list-sdks | grep -Eq '^9\.'; then
    curl -fsSL "https://packages.microsoft.com/config/ubuntu/$(. /etc/os-release && echo "$VERSION_ID")/packages-microsoft-prod.deb" -o /tmp/packages-microsoft-prod.deb
    dpkg -i /tmp/packages-microsoft-prod.deb
    rm -f /tmp/packages-microsoft-prod.deb
    apt-get update
    apt-get install -y dotnet-sdk-9.0
  fi
}

resolve_existing_configuration() {
  log "Resolving existing configuration"

  local existing_connection_string=""
  local existing_admin_email=""
  local existing_admin_password=""
  local existing_environment=""

  existing_connection_string="$(
    first_non_empty \
      "${CONNECTION_STRING:-}" \
      "$(read_env_value "$BACKEND_ENV_FILE" "ConnectionStrings__DefaultConnection" || true)" \
      "$(read_env_value "$LEGACY_ENV_FILE" "ConnectionStrings__DefaultConnection" || true)" \
      "$(read_env_value "$LEGACY_ROOT_ENV_FILE" "ConnectionStrings__DefaultConnection" || true)" \
      ""
  )"

  existing_admin_email="$(
    first_non_empty \
      "${ADMIN_EMAIL:-}" \
      "$(read_env_value "$BACKEND_ENV_FILE" "AdminUser__Email" || true)" \
      "$(read_env_value "$BACKEND_ENV_FILE" "ADMIN_EMAIL" || true)" \
      "$(read_env_value "$LEGACY_ENV_FILE" "AdminUser__Email" || true)" \
      "$(read_env_value "$LEGACY_ENV_FILE" "ADMIN_EMAIL" || true)" \
      "$(read_env_value "$LEGACY_ROOT_ENV_FILE" "AdminUser__Email" || true)" \
      "$(read_env_value "$LEGACY_ROOT_ENV_FILE" "ADMIN_EMAIL" || true)" \
      ""
  )"

  existing_admin_password="$(
    first_non_empty \
      "${ADMIN_PASSWORD:-}" \
      "$(read_env_value "$BACKEND_ENV_FILE" "AdminUser__Password" || true)" \
      "$(read_env_value "$BACKEND_ENV_FILE" "ADMIN_PASSWORD" || true)" \
      "$(read_env_value "$LEGACY_ENV_FILE" "AdminUser__Password" || true)" \
      "$(read_env_value "$LEGACY_ENV_FILE" "ADMIN_PASSWORD" || true)" \
      "$(read_env_value "$LEGACY_ROOT_ENV_FILE" "AdminUser__Password" || true)" \
      "$(read_env_value "$LEGACY_ROOT_ENV_FILE" "ADMIN_PASSWORD" || true)" \
      ""
  )"

  existing_environment="$(
    first_non_empty \
      "${ASPNETCORE_ENVIRONMENT:-}" \
      "$(read_env_value "$BACKEND_ENV_FILE" "ASPNETCORE_ENVIRONMENT" || true)" \
      "$(read_env_value "$LEGACY_ENV_FILE" "ASPNETCORE_ENVIRONMENT" || true)" \
      "$(read_env_value "$LEGACY_ROOT_ENV_FILE" "ASPNETCORE_ENVIRONMENT" || true)" \
      "Production"
  )"

  [[ -n "$existing_connection_string" ]] || fail "Could not resolve ConnectionStrings__DefaultConnection from existing env files. Export CONNECTION_STRING before running."
  [[ -n "$existing_admin_email" ]] || fail "Could not resolve admin email from existing env files. Export ADMIN_EMAIL before running."
  [[ -n "$existing_admin_password" ]] || fail "Could not resolve admin password from existing env files. Export ADMIN_PASSWORD before running."

  CONNECTION_STRING="$existing_connection_string"
  ADMIN_EMAIL="$existing_admin_email"
  ADMIN_PASSWORD="$existing_admin_password"
  ASPNETCORE_ENVIRONMENT="$existing_environment"

  printf 'Connection string: %s\n' "$CONNECTION_STRING"
  printf 'Admin email: %s\n' "$ADMIN_EMAIL"
  printf 'ASP.NET Core environment: %s\n' "$ASPNETCORE_ENVIRONMENT"
}

prepare_directories() {
  log "Preparing directories"

  mkdir -p "$APP_DIR"
  mkdir -p "$RUNTIME_DIR"
  mkdir -p "$(dirname "$BACKEND_ENV_FILE")"
  mkdir -p "$FRONTEND_DIST_DIR"
  mkdir -p "$NEW_UPLOADS_DIR"

  chown -R "$APP_USER:$APP_USER" "$NEW_UPLOADS_DIR"
}

backup_existing_state() {
  log "Backing up current VPS state to $BACKUP_DIR"

  backup_path "$SERVICE_FILE"
  backup_path "$SERVICE_DROPIN_DIR"
  backup_path "$BACKEND_ENV_FILE"
  backup_path "$LEGACY_ENV_FILE"
  backup_path "$LEGACY_ROOT_ENV_FILE"
  backup_path "$NGINX_SITE_FILE"
  backup_path "$NGINX_SITE_LINK"

  if [[ -d "$APP_DIR" ]]; then
    mkdir -p "$BACKUP_DIR"
    printf '%s\n' "$APP_DIR" >"$BACKUP_DIR/app-dir.txt"
  fi
}

checkout_repository() {
  log "Checking out repository"

  if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" remote set-url origin "$REPO_URL"
    git -C "$APP_DIR" fetch --prune --tags origin
    git -C "$APP_DIR" reset --hard "origin/${DEPLOY_REF}"
    git -C "$APP_DIR" clean -fd
  else
    rm -rf "$APP_DIR"
    git clone --branch "$DEPLOY_REF" "$REPO_URL" "$APP_DIR"
  fi
}

write_backend_environment() {
  log "Writing backend environment file"

  cat >"$BACKEND_ENV_FILE" <<EOF
ASPNETCORE_ENVIRONMENT=${ASPNETCORE_ENVIRONMENT}
ConnectionStrings__DefaultConnection=${CONNECTION_STRING}
AdminUser__Email=${ADMIN_EMAIL}
AdminUser__Password=${ADMIN_PASSWORD}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

  chmod 600 "$BACKEND_ENV_FILE"
}

write_compatibility_root_env() {
  log "Writing compatibility root .env for transition period"

  cat >"${APP_DIR}/.env" <<EOF
VITE_API_URL=/api
VITE_API_TARGET=http://127.0.0.1:3001
ASPNETCORE_ENVIRONMENT=${ASPNETCORE_ENVIRONMENT}
ConnectionStrings__DefaultConnection=${CONNECTION_STRING}
AdminUser__Email=${ADMIN_EMAIL}
AdminUser__Password=${ADMIN_PASSWORD}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

  chmod 600 "${APP_DIR}/.env"
}

cleanup_legacy_configuration() {
  log "Removing obsolete configuration files"

  if [[ "$LEGACY_ENV_FILE" != "$BACKEND_ENV_FILE" && -f "$LEGACY_ENV_FILE" ]]; then
    rm -f "$LEGACY_ENV_FILE"
  fi
}

write_systemd_unit() {
  log "Writing systemd unit"

  rm -rf "$SERVICE_DROPIN_DIR"

  cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Clothing Store API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/dotnet ${RUNTIME_DIR}/Store.Api.dll
Restart=always
RestartSec=5
User=${APP_USER}
EnvironmentFile=${BACKEND_ENV_FILE}

[Install]
WantedBy=multi-user.target
EOF
}

write_nginx_config() {
  log "Writing Nginx config"

  cat >"$NGINX_SITE_FILE" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${FRONTEND_DIST_DIR};
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

  ln -sf "$NGINX_SITE_FILE" "$NGINX_SITE_LINK"
  rm -f /etc/nginx/sites-enabled/default
}

cleanup_old_runtime() {
  log "Cleaning old runtime artifacts"

  rm -rf "${APP_DIR}/backend/Store.Api/publish"
  rm -rf "${RUNTIME_DIR:?}/"*
}

move_legacy_uploads() {
  if [[ -d "$OLD_UPLOADS_DIR" ]]; then
    log "Migrating legacy uploads from $OLD_UPLOADS_DIR"
    rsync -a "$OLD_UPLOADS_DIR"/ "$NEW_UPLOADS_DIR"/
  fi

  chown -R "$APP_USER:$APP_USER" "$NEW_UPLOADS_DIR"
}

ensure_postgres_ready() {
  local db_host
  local db_port
  local db_name
  local db_user
  local db_password
  local db_ready="false"

  db_host="$(
    first_non_empty \
      "$(connection_value "Host" || true)" \
      "$(connection_value "Server" || true)" \
      "127.0.0.1"
  )"
  db_port="$(
    first_non_empty \
      "$(connection_value "Port" || true)" \
      "5432"
  )"
  db_name="$(
    first_non_empty \
      "$(connection_value "Database" || true)" \
      "$(connection_value "Initial Catalog" || true)" \
      ""
  )"
  db_user="$(
    first_non_empty \
      "$(connection_value "Username" || true)" \
      "$(connection_value "User ID" || true)" \
      "$(connection_value "User Id" || true)" \
      ""
  )"
  db_password="$(
    first_non_empty \
      "$(connection_value "Password" || true)" \
      ""
  )"

  if [[ "$db_host" != "127.0.0.1" && "$db_host" != "localhost" ]]; then
    log "Skipping local PostgreSQL startup because database host is $db_host"
    return 0
  fi

  log "Ensuring PostgreSQL is ready on ${db_host}:${db_port}"

  systemctl enable postgresql >/dev/null 2>&1 || true
  systemctl start postgresql || true

  if command -v pg_lsclusters >/dev/null 2>&1; then
    while read -r version cluster port status owner data_dir log_file; do
      [[ -n "${version:-}" ]] || continue
      [[ "${port:-}" == "$db_port" ]] || continue

      if [[ "$status" != "online" ]]; then
        pg_ctlcluster "$version" "$cluster" start || true
      fi
    done < <(pg_lsclusters --no-header || true)
  fi

  for attempt in $(seq 1 30); do
    if command -v pg_isready >/dev/null 2>&1; then
      if pg_isready -h "$db_host" -p "$db_port" >/dev/null 2>&1; then
        db_ready="true"
        break
      fi
    elif (echo >/dev/tcp/"$db_host"/"$db_port") >/dev/null 2>&1; then
      db_ready="true"
      break
    fi

    sleep 1
  done

  if [[ "$db_ready" != "true" ]]; then
    systemctl status postgresql --no-pager || true
    if command -v pg_lsclusters >/dev/null 2>&1; then
      pg_lsclusters || true
    fi
    fail "PostgreSQL is not reachable on ${db_host}:${db_port}. Check cluster status and the connection string."
  fi

  if [[ -n "$db_name" && -n "$db_user" && -n "$db_password" && $(command -v psql) ]]; then
    if ! PGPASSWORD="$db_password" psql \
      -h "$db_host" \
      -p "$db_port" \
      -U "$db_user" \
      -d "$db_name" \
      -Atqc "select current_database(), current_user;" >/dev/null 2>&1; then
      fail "PostgreSQL is running but application credentials cannot access database '${db_name}' as user '${db_user}'."
    fi
  fi
}

build_and_publish() {
  log "Building frontend and publishing backend"

  cd "$APP_DIR"
  rm -rf node_modules dist
  npm ci
  npm run build
  rsync -a --delete dist/ "$FRONTEND_DIST_DIR"/
  dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o "$RUNTIME_DIR"
}

restart_services() {
  log "Reloading and restarting services"

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  nginx -t
  systemctl restart "$SERVICE_NAME"
  systemctl restart nginx
}

run_checks() {
  log "Running post-deploy checks"

  systemctl status "$SERVICE_NAME" --no-pager
  systemctl status nginx --no-pager

  local backend_ok="false"
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 5 "$BACKEND_HEALTHCHECK_URL" >/dev/null; then
      backend_ok="true"
      break
    fi

    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
      systemctl status "$SERVICE_NAME" --no-pager || true
      journalctl -u "$SERVICE_NAME" -n 100 --no-pager || true
      fail "Backend service left active state while waiting for health check."
    fi

    sleep 1
  done

  if [[ "$backend_ok" != "true" ]]; then
    systemctl status "$SERVICE_NAME" --no-pager || true
    journalctl -u "$SERVICE_NAME" -n 100 --no-pager || true
    fail "Backend health check did not pass in time: ${BACKEND_HEALTHCHECK_URL}"
  fi

  curl --fail --silent --show-error --max-time 10 -I "http://${DOMAIN}" >/dev/null || true
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
}

print_summary() {
  cat <<EOF

[OK] VPS migration completed.

Repository:        ${APP_DIR}
Runtime dir:       ${RUNTIME_DIR}
Frontend dist dir: ${FRONTEND_DIST_DIR}
Backend env file:  ${BACKEND_ENV_FILE}
Systemd unit:      ${SERVICE_FILE}
Nginx site:        ${NGINX_SITE_FILE}
Backup dir:        ${BACKUP_DIR}

Next:
1. Push the updated repository files to GitHub.
2. In GitHub Actions, make sure BACKEND_DLL_PATH is ${RUNTIME_DIR}/Store.Api.dll
3. In GitHub Actions, make sure BACKEND_ENV_FILE is ${BACKEND_ENV_FILE}
EOF
}

main() {
  ensure_root
  BACKUP_DIR="/root/clothing-store-migration-$(timestamp)"

  ensure_required_tools
  resolve_existing_configuration
  prepare_directories
  backup_existing_state
  checkout_repository
  write_backend_environment
  write_compatibility_root_env
  cleanup_legacy_configuration
  write_systemd_unit
  write_nginx_config
  cleanup_old_runtime
  move_legacy_uploads
  build_and_publish
  ensure_postgres_ready
  restart_services
  run_checks
  print_summary
}

main "$@"
