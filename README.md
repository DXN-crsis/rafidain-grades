**English** · [العربية](README.ar.md)

# Results Portal — Al-Rafidain Vocational Preparatory School

Students look up their exam results with their secret exam number. Staff manage departments, stages, sections, subjects, and grades from an admin dashboard.

## <img src="https://api.iconify.design/octicon/terminal-16.svg?color=%238b949e&height=18" align="top"> Running locally

```bash
npm install
npm start
```

Then open http://localhost:3000

## <img src="https://api.iconify.design/octicon/key-16.svg?color=%238b949e&height=18" align="top"> Admin account

Defaults:

- User: `admin`
- Password: `rafidain@2026`

> [!IMPORTANT]
> Change these before deploying. Set them through environment variables:
>
> ```bash
> ADMIN_USER=... ADMIN_PASS=... npm start
> ```
>
> They apply on first run only, before `data/grades.sqlite` is created.

## <img src="https://api.iconify.design/octicon/beaker-16.svg?color=%238b949e&height=18" align="top"> Tests

```bash
npm test
```

## <img src="https://api.iconify.design/octicon/rocket-16.svg?color=%238b949e&height=18" align="top"> Deployment

The full Railway guide, including backup, restore, and troubleshooting, is in [`docs/دليل-النشر.md`](docs/دليل-النشر.md).

> [!WARNING]
> Attach a persistent volume at `/data` and set `DB_PATH=/data/grades.sqlite`. Without it, the database is erased on every deploy.

Local development needs no extra configuration.

## <img src="https://api.iconify.design/octicon/database-16.svg?color=%238b949e&height=18" align="top"> Backups

```bash
npm run backup
```

Writes a verified snapshot to `backups/grades-backup-<date>.sqlite`. Safe to run while the server is up. Restore steps are in the deployment guide.
