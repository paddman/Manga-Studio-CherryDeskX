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

## Persistence warning

This MVP stores projects and imported image data in `localStorage`. That is suitable for a functional front-end prototype, not durable production storage. Before public production use, connect project JSON to an authenticated API and store image binaries in S3-compatible object storage.

## Recommended production additions

- CherryDeskX OIDC login.
- S3-compatible asset storage with signed URLs.
- PostgreSQL project and revision metadata.
- Redis queue for export and AI jobs.
- Antivirus and file-type validation for uploads.
- Rate limits, tenant quotas and audit logs.
