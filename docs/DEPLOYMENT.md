# Deployment

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:4173`.

## Production build

```bash
npm install
npm run typecheck
npm test
npm run build
npm run preview
```

The static output is written to `dist/`.

## Docker

```bash
docker compose up -d --build
curl http://127.0.0.1:8088/healthz
```

The application is then available to the host reverse proxy at `127.0.0.1:8088`. The Compose port is intentionally not exposed on public interfaces.

## Reverse proxy and DNS

Create a DNS record for `manga.cherrydeskx.com` pointing to the deployment host. Terminate TLS at the existing reverse proxy and forward traffic to `127.0.0.1:8088`.

Example Caddy route:

```caddyfile
manga.cherrydeskx.com {
  reverse_proxy 127.0.0.1:8088
}
```

Example Nginx TLS proxy location:

```nginx
location / {
  proxy_pass http://127.0.0.1:8088;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

The repository includes a complete virtual host at
`deploy/nginx/manga.cherrydeskx.com.conf`. On an Ubuntu host using the existing
BeezaChat certificate, install and enable it with:

```bash
sudo install -m 0644 deploy/nginx/manga.cherrydeskx.com.conf \
  /etc/nginx/sites-available/manga.cherrydeskx.com
sudo ln -s /etc/nginx/sites-available/manga.cherrydeskx.com \
  /etc/nginx/sites-enabled/manga.cherrydeskx.com
sudo nginx -t
sudo systemctl reload nginx

curl -fsS http://127.0.0.1:8088/healthz
curl -fsS https://manga.cherrydeskx.com/ | grep 'Cherry Manga Studio'
```

Use a certificate whose origin coverage includes this hostname when the proxy
does TLS termination. Cloudflare mode and origin certificate policy remain
deployment-specific.

## Persistence model

The editor stores versioned project metadata in IndexedDB and image/font assets plus raster snapshots in separate IndexedDB object stores. `localStorage` is retained only as a metadata recovery fallback. Legacy MVP data URLs are migrated to the binary store during initialization. `.cherrymanga` files are portable, validated ZIP archives containing `project.json`, asset binaries and available raster snapshots. Production CSP must allow `font-src blob:` for embedded fonts and same-origin workers for export packaging; the included `nginx.conf` already does so.

CherryDeskX HTTP, SSO, Workspace and AI adapters are present as typed contracts but are disabled unless `VITE_ENABLE_CHERRYDESKX_API=true`. The default deployment therefore has an explicit local/offline state and does not claim cloud persistence or AI completion.

Copy `.env.example` to `.env` and set the public, non-secret URLs before enabling an API gateway. Never place access tokens in `VITE_*` variables.

## Release procedure

Deploy only a reviewed commit whose CI is green:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
docker compose build --pull
docker compose up -d --remove-orphans
docker compose ps
curl -fsS http://127.0.0.1:8088/healthz
curl -fsSIL https://manga.cherrydeskx.com/
```

The image uses `npm ci` with the committed lockfile, emits no production source map, runs behind Nginx with `no-new-privileges`, and binds the container only to loopback. A failed health check leaves the previous image available for an explicit Compose rollback; do not delete the previous image until the public smoke check succeeds.

## Recommended production additions

- CherryDeskX OIDC login.
- S3-compatible asset storage with signed URLs.
- PostgreSQL project and revision metadata.
- Redis queue for export and AI jobs.
- Antivirus and file-type validation for uploads.
- Rate limits, tenant quotas and audit logs.
- End-to-end browser automation against the deployed reverse proxy (the repository already has unit, DOM interaction, render-smoke, export and archive round-trip coverage).
