#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly APP_DIR='/opt/1panel/www/sites/excitatio-insectorum'
readonly COMPOSE_FILE="$APP_DIR/docker-compose.yml"
readonly DATABASE_FILE="$APP_DIR/data/sqlite/dev.db"
readonly STATIC_DIR="$APP_DIR/static"
readonly HEALTH_URL='http://127.0.0.1:3000/api/v1/health'
readonly SERVER_IMAGE='ghcr.io/harutaizumiya/excitatio-insectorum-server'

release_sha="${1:-}"
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Expected a full 40-character commit SHA.' >&2
  exit 2
fi

readonly RELEASE_DIR="$APP_DIR/releases/$release_sha"
readonly WEB_DIR="$RELEASE_DIR/web"
readonly NEW_IMAGE="$SERVER_IMAGE:$release_sha"

for command_name in curl docker python3 sqlite3; do
  command -v "$command_name" >/dev/null || {
    echo "Required command is missing: $command_name" >&2
    exit 1
  }
done

if [[ ! -f "$COMPOSE_FILE" || ! -f "$DATABASE_FILE" || ! -f "$WEB_DIR/index.html" ]]; then
  echo 'Release files or the current production deployment are incomplete.' >&2
  exit 1
fi

if ! curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
  echo 'The current API health check failed; refusing to deploy.' >&2
  exit 1
fi

compose=(docker compose --project-name excitatio-insectorum --project-directory "$APP_DIR" --file "$COMPOSE_FILE")
current_image="$("${compose[@]}" config --images server)"
if [[ -z "$current_image" || "$current_image" != excitatio-insectorum-server:* ]]; then
  echo "Unexpected server image in production Compose: $current_image" >&2
  exit 1
fi

old_image_id="$(docker image inspect "$current_image" --format '{{.Id}}')"
rollback_tag="excitatio-insectorum-server:rollback-$release_sha"
if docker image inspect "$rollback_tag" >/dev/null 2>&1; then
  echo "Rollback image tag already exists: $rollback_tag" >&2
  exit 1
fi

backup_dir="$APP_DIR/backups/deploy"
install -d -m 700 "$backup_dir"
backup_file="$backup_dir/dev-$release_sha-$(date -u +%Y%m%dT%H%M%SZ).db"
sqlite3 "$DATABASE_FILE" ".backup '$backup_file'"
backup_integrity="$(sqlite3 "$backup_file" 'PRAGMA integrity_check;')"
if [[ "$backup_integrity" != 'ok' ]]; then
  echo "SQLite backup integrity check failed: $backup_integrity" >&2
  exit 1
fi
chmod 600 "$backup_file"

echo "Pulling server image for $release_sha"
if [[ -z "${GHCR_TOKEN:-}" || -z "${GHCR_USERNAME:-}" ]]; then
  echo 'GHCR credentials are required to pull the release image.' >&2
  exit 1
fi

docker_auth_dir="$(mktemp -d /tmp/excitatio-docker-auth.XXXXXXXXXX)"
export DOCKER_CONFIG="$docker_auth_dir"
cleanup_registry_auth() {
  docker logout ghcr.io >/dev/null 2>&1 || true
  rm -f -- "$docker_auth_dir/config.json"
  rmdir -- "$docker_auth_dir" 2>/dev/null || true
}
trap cleanup_registry_auth EXIT

printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin
docker pull "$NEW_IMAGE"
docker logout ghcr.io
rm -f -- "$docker_auth_dir/config.json"
rmdir -- "$docker_auth_dir"
trap - EXIT
unset DOCKER_CONFIG GHCR_TOKEN GHCR_USERNAME
docker image inspect "$NEW_IMAGE" >/dev/null

docker image tag "$old_image_id" "$rollback_tag"
docker image tag "$NEW_IMAGE" "$current_image"

rollback_server() {
  docker image tag "$rollback_tag" "$current_image" &&
    "${compose[@]}" up -d --no-deps --force-recreate server
}

echo "Recreating the existing API container with $NEW_IMAGE"
if ! "${compose[@]}" up -d --no-deps --force-recreate server; then
  echo 'Compose could not start the new API; restoring the previous image.' >&2
  if ! rollback_server; then
    echo 'Previous image could not be restarted automatically; inspect the container and backup.' >&2
  fi
  echo "Database backup: $backup_file" >&2
  exit 1
fi

healthy=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" != 1 ]]; then
  echo 'New API health check failed; restoring the previous image.' >&2
  if ! rollback_server; then
    echo 'Previous image could not be restarted automatically; inspect the container and backup.' >&2
  fi
  echo "Database backup: $backup_file" >&2
  echo "New image retained as: $NEW_IMAGE" >&2
  exit 1
fi

cp -p "$STATIC_DIR/index.html" "$RELEASE_DIR/index.previous.html"
python3 - "$WEB_DIR" "$STATIC_DIR" "$release_sha" <<'PY'
import os
import shutil
import sys

source, destination, release_sha = sys.argv[1:]
os.makedirs(destination, exist_ok=True)

for root, directories, files in os.walk(source):
    relative = os.path.relpath(root, source)
    target_root = destination if relative == '.' else os.path.join(destination, relative)
    os.makedirs(target_root, exist_ok=True)
    for directory in directories:
        os.makedirs(os.path.join(target_root, directory), exist_ok=True)
    for filename in files:
        if filename == 'index.html':
            continue
        shutil.copy2(os.path.join(root, filename), os.path.join(target_root, filename))

new_index = os.path.join(source, 'index.html')
temporary_index = os.path.join(destination, f'.index-{release_sha}.tmp')
shutil.copy2(new_index, temporary_index)
os.replace(temporary_index, os.path.join(destination, 'index.html'))
PY

printf '%s\n' "$release_sha" > "$RELEASE_DIR/deployed-commit"
echo "Deployment completed: $release_sha"
echo "Previous image retained as: $rollback_tag"
echo "Database backup: $backup_file"
