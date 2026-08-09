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

The application is then available on port `8088`.

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

## Persistence model

The editor stores versioned project metadata in IndexedDB and binary assets in a separate IndexedDB object store. `localStorage` is retained only as a metadata fallback for browsers without IndexedDB. Legacy MVP data URLs are migrated to the binary store during initialization. `.cherrymanga` files are portable ZIP archives containing `project.json` and asset binaries.

CherryDeskX HTTP, SSO, Workspace and AI adapters are present as typed contracts but are disabled unless `VITE_ENABLE_CHERRYDESKX_API=true`. The default deployment therefore has an explicit local/offline state and does not claim cloud persistence or AI completion.

Copy `.env.example` to `.env` and set the public, non-secret URLs before enabling an API gateway. Never place access tokens in `VITE_*` variables.

## Recommended production additions

- CherryDeskX OIDC login.
- S3-compatible asset storage with signed URLs.
- PostgreSQL project and revision metadata.
- Redis queue for export and AI jobs.
- Antivirus and file-type validation for uploads.
- Rate limits, tenant quotas and audit logs.
- Browser smoke coverage for editor render, project migration and archive round-trip.
