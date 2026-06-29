# Deployment Guide

## Recommended Low-Cost Path

Deploy as a small Node web service on a free or low-cost platform that supports persistent files or mounted volumes. Examples include Render, Fly.io, Railway, or a small VPS.

For fully persistent production data, mount `data/` as a volume or replace the file store with SQLite using the same store interface.

## Production Settings

Set:

```bash
NODE_ENV=production
ADMIN_TOKEN=<strong-token>
DIRECTORY_DATA_PATH=/data/directory.json
PORT=3000
HOST=0.0.0.0
```

Do not set `AI_API_KEY` or vector provider keys unless an external adapter has been implemented and reviewed.

## Docker

Build:

```bash
docker build -t ai-directory-search .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e ADMIN_TOKEN=change-me \
  -e HOST=0.0.0.0 \
  ai-directory-search
```

Mount data:

```bash
docker run --rm -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  -e NODE_ENV=production \
  -e ADMIN_TOKEN=change-me \
  -e HOST=0.0.0.0 \
  ai-directory-search
```
