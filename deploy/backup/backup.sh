#!/bin/sh
# Nightly backups (see deploy/README.md, "Backups").
#
# 1. Database dump into /backups, kept 14 days on the server.
# 2. If BACKUP_S3_BUCKET is set, an encrypted off-site copy in any S3-compatible storage
#    (Backblaze B2, Cloudflare R2, Hetzner Object Storage, AWS S3…):
#      db/        the dumps, kept 30 days
#      storage/   uploaded images, synced every night
#      deleted/   images deleted from the server, kept 30 days
#    Encrypted by rclone with BACKUP_PASSPHRASE (file contents and names): the storage
#    provider can't read it. Keep the passphrase somewhere safe; without it backups are useless.
#
# BACKUP_ONCE=1 runs one round and exits (for testing and manual backups).
set -u
# Everything is configured through environment variables; an empty file keeps rclone quiet.
export RCLONE_CONFIG=/tmp/rclone.conf
: >"$RCLONE_CONFIG"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  : "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE to encrypt off-site backups}"
  export RCLONE_CONFIG_OFFSITE_TYPE=s3
  export RCLONE_CONFIG_OFFSITE_PROVIDER=Other
  export RCLONE_CONFIG_OFFSITE_ENDPOINT="${BACKUP_S3_ENDPOINT:?Set BACKUP_S3_ENDPOINT}"
  export RCLONE_CONFIG_OFFSITE_REGION="${BACKUP_S3_REGION:-auto}"
  export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:?Set BACKUP_S3_ACCESS_KEY_ID}"
  export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:?Set BACKUP_S3_SECRET_ACCESS_KEY}"
  export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true
  # "secret:" is the encrypted view of the bucket.
  export RCLONE_CONFIG_SECRET_TYPE=crypt
  export RCLONE_CONFIG_SECRET_REMOTE="offsite:${BACKUP_S3_BUCKET}/postmeadow"
  RCLONE_CONFIG_SECRET_PASSWORD="$(rclone obscure "$BACKUP_PASSPHRASE")"
  export RCLONE_CONFIG_SECRET_PASSWORD
fi

round() {
  day=$(date -u +%Y-%m-%d)
  file="/backups/postmeadow-$day.dump"
  status=ok

  if pg_dump --format=custom --file="$file.tmp" && mv "$file.tmp" "$file"; then
    echo "backup: database dumped to $file"
  else
    echo "BACKUP FAILED: database dump" >&2
    status=failed
  fi
  find /backups -name 'postmeadow-*.dump' -mtime +14 -delete

  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    if [ "$status" = ok ] && rclone copy "$file" secret:db/; then
      echo "backup: database copied off-site"
    else
      echo "BACKUP FAILED: off-site database copy" >&2
      status=failed
    fi
    if rclone sync /data/storage secret:storage --backup-dir "secret:deleted/$day"; then
      echo "backup: images synced off-site"
    else
      echo "BACKUP FAILED: off-site image sync" >&2
      status=failed
    fi
    rclone delete --min-age 30d secret:db >/dev/null 2>&1
    rclone delete --min-age 30d --rmdirs secret:deleted >/dev/null 2>&1
  else
    echo "backup: off-site copy skipped (BACKUP_S3_BUCKET not set)"
  fi
  echo "backup: round finished ($status)"
}

if [ "${BACKUP_ONCE:-0}" = 1 ]; then
  round
  exit 0
fi
while true; do
  round
  sleep 86400
done
