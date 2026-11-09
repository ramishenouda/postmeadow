# Nightly backups: pg_dump (from the Postgres image) plus rclone for off-site copies.
FROM postgres:17-alpine
RUN apk add --no-cache rclone
COPY backup.sh /usr/local/bin/backup.sh
ENTRYPOINT ["sh", "/usr/local/bin/backup.sh"]
