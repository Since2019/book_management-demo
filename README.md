# Bookstack (demo)

[中文说明](README.zh-CN.md)

A personal library manager built with React, vinext, and Cloudflare D1. Search bibliographic sources, save books, organize boxes and tags, upload covers, and import or export library backups.

This public demo starts with an empty library. Private library records, cover uploads, box labels, backups, and local credentials are excluded from Git.

## Language

English is the default for new browser sessions. Use **EN**, **简**, or **繁** to switch languages. Your saved language preference is retained.

## Windows installation

1. Double-click `安装.cmd` while connected to the internet. It downloads a project-local Node.js runtime, installs dependencies, and builds the app.
2. Double-click `启动.cmd`. The app opens at http://127.0.0.1:3000/ when ready.
3. Close the launch window to stop the server.

The portable runtime is stored in `.runtime`; the local database is stored in `.wrangler`. Back up the entire `.wrangler` directory to preserve your library. These folders are ignored by Git.

## Development

Requires Node.js >=22.13.0.

```sh
npm install
npm run dev
npm run build
```

The development server prints its local URL. If a port is occupied, use the URL it reports.

## Optional CiNii Books configuration

Request an Application ID through the [official CiNii developer registration guide](https://support.nii.ac.jp/ja/cinii/api/developer). Create an ignored `.env.local` file in the project root:

```env
CINII_APP_ID=your_application_id
```

Restart the app after changing this file. If no ID is configured, CiNii is skipped; other sources remain available. No API key is bundled with this repository.

## Search sources

Search supports ISBN, keywords, call numbers, and older unified book numbers. Chinese ISBN search also queries Kongfz and accepts exact ISBN matches, merging duplicates. Source availability depends on the external service. `/api/search` reports source names, error types, and available HTTP status codes without returning credentials or request URLs. CALIS verification prompts link to the official website; Douban ISBN 404 responses indicate no matching record, while 429 indicates rate limiting.

`data/singapore-tcm-catalog.json` contains reference catalog data for searching, rather than private library records.

## Project structure

- `app/`: application UI and API routes
- `db/` and `drizzle/`: database schema and migrations
- `vite.config.ts`: local Cloudflare bindings and optional environment configuration
- `.openai/hosting.json`: optional hosting metadata and D1 binding name
- `scripts/`: installation, startup, and catalog import helpers
- `clipboard-tool/`: optional Windows clipboard utility

## Data and credentials

Do not commit `.env*`, `.wrangler`, `.runtime`, or `outputs` backups. Personal box-label SVGs are also ignored. Configure any credentials locally; the demo repository contains only configuration variable names and placeholders.
