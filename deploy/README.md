# Deploying Postmeadow

Postmeadow runs as four containers on one Linux server: the app, Postgres, Caddy
(HTTPS) and a nightly backup job (with encrypted off-site copies). The same setup works on any VPS with Docker, so it
runs on the Hostinger KVM 2 today and can move to Hetzner later (see the last section).

```
visitors ─https─▶ Caddy :443 ─▶ app :3000 ─▶ Postgres
                                   │
                                   ├─ uploads volume (/data/storage)
                                   └─ Resend (email), Stripe (billing)
```

GitHub Actions builds the image and deploys it over SSH (`.github/workflows/deploy.yml`).
On the server everything lives in `/opt/postmeadow`: `docker-compose.yml`, `Caddyfile`,
`.env` (secrets, only on the server) and `backups/`.

Commands below are run on the server as `root` unless they say otherwise. If you ever lock
yourself out, Hostinger's hPanel has a browser terminal for the VPS.

---

## 1. Check what's already on the server

The VPS has been running for a while. Before installing anything, see what's there:

```bash
docker ps 2>/dev/null; ss -tlnp | grep -E ':(80|443)\b'; systemctl list-units --type=service --state=running --no-pager | grep -vE 'systemd|dbus|ssh|cron|getty|polkit|rsyslog|snapd|udisks|multipathd|networkd|resolved|timesyncd|unattended'
```

- **Nothing on ports 80/443:** carry on.
- **Something already uses 80/443** (nginx, Apache, another app): stop here and decide how
  it should coexist. Caddy needs those ports, but it can also serve the other site.

## 2. Point the domain at the server

At your domain's DNS provider, set:

| Type | Name  | Value            |
| ---- | ----- | ---------------- |
| A    | `@`   | `145.223.82.249` |
| A    | `www` | `145.223.82.249` |

Remove any parking or "coming soon" records for `@` and `www`. Check with
`dig +short postmeadow.com` (it should print the IP) before the first deploy, because Caddy
needs it to get the HTTPS certificate.

## 3. Prepare the server (once)

```bash
apt update && apt -y upgrade
apt -y install ufw unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades   # automatic security updates

# Firewall: SSH, HTTP, HTTPS only. (Postgres isn't published, so it's never reachable.)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable

# Docker (official repository)
curl -fsSL https://get.docker.com | sh

# A deploy user for GitHub Actions, allowed to run Docker, with its own SSH key.
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
mkdir -p /opt/postmeadow/backups && chown -R deploy:deploy /opt/postmeadow
```

On **your own computer**, create the key GitHub will use and install it for `deploy`:

```bash
ssh-keygen -t ed25519 -f postmeadow_deploy -N "" -C "github-deploy"
ssh-copy-id -i postmeadow_deploy.pub deploy@145.223.82.249   # or paste the .pub into /home/deploy/.ssh/authorized_keys
ssh -i postmeadow_deploy deploy@145.223.82.249 docker ps        # should work
```

Once key logins work, turn off password logins (keep the hPanel terminal as a fallback):

```bash
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
```

## 4. Let the server pull the image

The image lives in GitHub Container Registry, next to the repo. If the repo is private, the
server needs read access. Create a GitHub token (Settings → Developer settings → Personal
access tokens → Fine-grained or classic with only `read:packages`), then as `deploy`:

```bash
echo "<token>" | docker login ghcr.io -u ramishenouda --password-stdin
```

## 5. Configure the app

As `deploy`, create `/opt/postmeadow/.env` from [`deploy/.env.example`](.env.example):

```bash
cd /opt/postmeadow
nano .env          # paste .env.example, then fill in
chmod 600 .env
```

- `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET`: generate each with `openssl rand -base64 32`.
- Email and billing settings: see steps 7 and 8. The app starts without Stripe (billing
  off), but it needs Resend to send sign-in links in production.

## 6. GitHub secrets and the first deploy

In the repo → Settings → Secrets and variables → Actions, add:

| Secret               | Value                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| `DEPLOY_HOST`        | `145.223.82.249`                                                       |
| `DEPLOY_USER`        | `deploy`                                                               |
| `DEPLOY_SSH_KEY`     | the contents of the private key file `postmeadow_deploy`               |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 145.223.82.249` (from your computer) |
| `DEPLOY_SITE_URL`    | `https://postmeadow.com`                                               |

Then Actions → **Deploy** → Run workflow. It builds the image, copies `docker-compose.yml`
and `Caddyfile` to the server, runs migrations and starts everything. The first start takes
a minute while Caddy gets the certificate. Open https://postmeadow.com.

## 7. Email: Resend

1. In Resend, add the domain `postmeadow.com` and create the DNS records it shows (SPF,
   DKIM and a DMARC record) at your DNS provider. Wait until Resend shows it as verified.
2. Create an API key → `RESEND_API_KEY`. Set `EMAIL_TRANSPORT=resend` and an `EMAIL_FROM`
   on the domain, e.g. `Postmeadow <hello@postmeadow.com>`.
3. Webhooks → add `https://postmeadow.com/api/webhooks/resend` with `email.bounced`,
   `email.complained`, `email.suppressed`, `email.failed`, `email.opened` and
   `email.clicked`. Put its signing secret in `RESEND_WEBHOOK_SECRET`.
4. Turn on open and click tracking for the domain.
5. Restart to apply: `docker compose up -d`.

## 8. Billing: Stripe (when you're ready to take payments)

1. Switch Stripe to live mode. Put the live secret key in `STRIPE_SECRET_KEY` on the server.
2. On your computer, with the **live** key in `.env.local`, run `npm run stripe:setup -- --live`
   once. It creates the products and prices.
3. Developers → Webhooks → add `https://postmeadow.com/api/webhooks/stripe` with
   `checkout.session.completed` and all `customer.subscription.*` events. Put its signing
   secret in `STRIPE_WEBHOOK_SECRET`.
4. Settings → Billing → Customer portal: enable cancellations, payment method updates and
   invoices.
5. `docker compose up -d`, then buy Pro with a real card and refund yourself to check.

### Paid newsletters (Stripe Connect)

Writers sell subscriptions to their readers through **Stripe Connect** (Express accounts);
each payment goes to the writer's account minus our fee (10% Free, 5% Pro, 3% Business, in
`src/lib/fees.ts`).

1. Stripe → Connect → get started, choose **Express** accounts, fill in the platform profile
   and branding.
2. In the webhook from step 3 above, also tick **Listen to events on Connected accounts** →
   `account.updated` (or add a second endpoint for it with the same URL; then both secrets
   must match, so one endpoint is simpler).
3. Readers manage their subscription through the same customer portal (step 4).

## 9. Publications' own domains

Writers on Pro and Business can put their publication on their own domain
(`news.brand.com`) and send from their own address.

- **Web:** they add a CNAME to `CUSTOM_DOMAIN_TARGET` (or the site's host). Create that
  name once: e.g. `domains.postmeadow.com` → A record to this server. The Caddyfile's
  `https://` block gets each verified domain a certificate on demand (it asks
  `/api/domains/check` first, so only verified domains get one). Ports 80 and 443 must stay
  open for that.
- **Sending:** uses Resend's Domains API with the same `RESEND_API_KEY`, which must have
  **full access** (not "sending only"). Writers add the records shown in Settings.

---

## Day to day

```bash
cd /opt/postmeadow
docker compose ps                       # what's running
docker compose logs -f app              # app logs (also: caddy, postgres, backup)
docker compose restart app              # restart the app
```

**Deploying:** Actions → Deploy → Run workflow. Each deploy pins the exact image
(`APP_IMAGE` in `.env`), runs migrations, then restarts. In-flight sends get 60 seconds to
finish; anything interrupted can be resumed from the post page.

**Rolling back:** set `APP_IMAGE` in `.env` to a previous build
(`ghcr.io/ramishenouda/postmeadow:<commit sha>`, listed under the repo's Packages) and run
`docker compose up -d`. Migrations only add things, so the previous version still runs.

### Backups

Every night the `backup` container:

- dumps the database to `/opt/postmeadow/backups` (kept 14 days on the server), and
- if `BACKUP_S3_*` is set in `.env`, copies the dump **and the uploaded images** to
  S3-compatible storage, **encrypted** with `BACKUP_PASSPHRASE` (the provider sees only
  scrambled names and contents). Dumps are kept 30 days off-site; images are synced, and
  ones deleted on the server are kept 30 days under `deleted/`.

**Setting up off-site backups** (once):

1. Create a bucket and an access key at any S3-compatible provider. Backblaze B2 and
   Cloudflare R2 cost cents a month at this size; Hetzner Object Storage fits the later move.
2. Fill in the `BACKUP_S3_*` lines in `.env` (see `.env.example` for endpoint examples), and
   `BACKUP_PASSPHRASE` from `openssl rand -base64 32`. **Save the passphrase in your password
   manager too**: without it the off-site backups can't be decrypted.
3. `docker compose up -d --build backup`, then check `docker compose logs backup` shows
   `round finished (ok)`. To run a round right away:
   `docker compose run --rm -e BACKUP_ONCE=1 backup`.

**Restore drill** (do it once, so you know it works). From the server's own dumps:

```bash
docker compose exec -T postgres pg_restore -U postmeadow -d postmeadow --clean --if-exists < backups/postmeadow-YYYY-MM-DD.dump
```

From the off-site copy (e.g. after losing the server), on any machine with Docker, using the
same values as in `.env`:

```bash
docker run --rm -v "$PWD/restore:/restore" --entrypoint sh \
  -e RCLONE_CONFIG_OFFSITE_TYPE=s3 -e RCLONE_CONFIG_OFFSITE_PROVIDER=Other \
  -e RCLONE_CONFIG_OFFSITE_ENDPOINT="$BACKUP_S3_ENDPOINT" \
  -e RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
  -e RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
  -e RCLONE_CONFIG_SECRET_TYPE=crypt -e RCLONE_CONFIG_SECRET_REMOTE="offsite:$BACKUP_S3_BUCKET/postmeadow" \
  -e PASS="$BACKUP_PASSPHRASE" rclone/rclone:1.75 \
  -c 'export RCLONE_CONFIG_SECRET_PASSWORD=$(rclone obscure "$PASS"); rclone copy secret: /restore'
```

You get `restore/db/postmeadow-*.dump` (restore with `pg_restore` as above) and
`restore/storage/images/…` (copy into the `postmeadow_storage` volume).

### Error monitoring (Sentry)

Create a free project at sentry.io (platform: Next.js), copy its DSN into `SENTRY_DSN` in
`.env` and run `docker compose up -d`. Server errors, failed sends and failed webhooks are
reported; no personal data is sent (no IPs, cookies, headers or bodies, and tokens in links
are blanked). For browser errors too, also set the repository variable
`NEXT_PUBLIC_SENTRY_DSN` (Settings → Variables) to the same DSN; it's built into the app.

### Admin

Put your email in `ADMIN_EMAILS` (comma-separated for more people) and open
`https://postmeadow.com/admin`: every publication with its plan, list growth, imports,
emails this month and bounce/spam rates, flagged ones first, with a Pause switch. Accounts
are also paused automatically when spam reports or bounces get too high, and admins get an
email when that happens.

---

## Moving to Hetzner later

Nothing in the app changes. About an hour, with a few minutes of downtime:

1. Create the Hetzner server (Ubuntu 24.04), do steps 3–4 on it, copy `/opt/postmeadow/.env`.
2. Lower the DNS TTL to 5 minutes a day ahead.
3. On the old server: `docker compose stop app` (stops new writes), take a final dump:
   `docker compose exec -T postgres pg_dump -U postmeadow -Fc postmeadow > final.dump`.
4. Copy the dump and the uploads to the new server:
   `docker run --rm -v postmeadow_storage:/data -v $PWD:/out alpine tar czf /out/storage.tgz -C /data .`
   then `scp final.dump storage.tgz deploy@NEW_IP:/opt/postmeadow/`.
5. On the new server: start Postgres (`docker compose up -d postgres`), restore
   (`pg_restore` as above), unpack uploads into the `postmeadow_storage` volume, then
   `docker compose up -d`.
6. Point the DNS A records at the new IP and update the `DEPLOY_HOST` and
   `DEPLOY_KNOWN_HOSTS` secrets. Keep the old server for a few days, then cancel it.
