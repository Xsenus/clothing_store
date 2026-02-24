# Deployment Guide (VPS)

## 1. Requirements

На VPS должны быть установлены:

- Docker Engine
- Docker Compose plugin
- Git

## 2. Initial server setup

```bash
sudo mkdir -p /opt/clothing_store
sudo chown $USER:$USER /opt/clothing_store
cd /opt/clothing_store
git clone <YOUR_REPO_URL> .
cp .env.example .env
```

Заполните `.env`:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

## 3. First run

```bash
mkdir -p deploy/data/uploads deploy/data/postgres
docker compose up -d --build
```

## 4. Verify

```bash
docker compose ps
curl -I http://localhost/
curl http://localhost/api/products
```

## 5. Update manually

```bash
cd /opt/clothing_store
git fetch --all
git reset --hard origin/main
docker compose up -d --build --remove-orphans
```

## 6. GitHub Actions auto-deploy

Workflow already exists: `.github/workflows/deploy-vps.yml`.

Set repository secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

## 7. Rollback

Если обновление неудачное:

```bash
cd /opt/clothing_store
git log --oneline -n 10
git reset --hard <PREVIOUS_COMMIT>
docker compose up -d --build --remove-orphans
```
