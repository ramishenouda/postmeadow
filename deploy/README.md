# Deploying Postmeadow

Postmeadow runs as four containers on one Linux server: the app, Postgres, Caddy
(HTTPS) and a nightly backup job. The same setup works on any VPS with Docker, so it
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

- **Database:** dumped every night to `/opt/postmeadow/backups` (kept 14 days).
- **Uploads and everything else:** Hostinger's VPS backup (currently weekly; consider daily
  in hPanel).
- **Off-server copy:** backups on the same server don't help if the server is lost. Copy them
  somewhere else regularly, e.g. from your computer:
  `rsync -av deploy@145.223.82.249:/opt/postmeadow/backups/ ./postmeadow-backups/`
  Later, automate this to object storage (e.g. Hetzner Object Storage) with `rclone`.

**Restore drill** (do it once, so you know it works):

```bash
docker compose exec -T postgres pg_restore -U postmeadow -d postmeadow --clean --if-exists < backups/postmeadow-YYYY-MM-DD.dump
```

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
