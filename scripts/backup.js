#!/usr/bin/env node

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const CORE_TABLES = ['admins', 'departments', 'stages', 'sections', 'subjects', 'students', 'grades'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') args.db = argv[++i];
    else if (argv[i] === '--dest') args.dest = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else {
      console.error(`وسيط غير معروف: ${argv[i]}`);
      process.exit(1);
    }
  }
  return args;
}

function timestamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function tableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);
}

function rowCounts(db, tables) {
  const counts = {};
  for (const t of tables) {
    counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('الاستخدام: node scripts/backup.js [--db <مسار>] [--dest <مجلد>]');
    return 0;
  }

  const srcPath = args.db || process.env.DB_PATH || path.join(ROOT, 'data', 'grades.sqlite');
  const destDir = args.dest || process.env.BACKUP_DIR || path.join(ROOT, 'backups');

  if (!fs.existsSync(srcPath)) {
    console.error(`قاعدة البيانات غير موجودة: ${srcPath}`);
    return 1;
  }
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, `grades-backup-${timestamp()}.sqlite`);

  let src;
  try {
    src = new Database(srcPath, { readonly: true, fileMustExist: true });
    src.pragma('busy_timeout = 5000');

    console.log(`المصدر: ${srcPath}`);
    console.log(`الوجهة: ${destPath}`);

    await src.backup(destPath);
  } catch (err) {
    console.error(`فشل النسخ الاحتياطي: ${err.message}`);
    if (fs.existsSync(destPath)) fs.rmSync(destPath, { force: true });
    return 1;
  }

  let backup;
  try {
    backup = new Database(destPath, { readonly: true, fileMustExist: true });

    const integrity = backup.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new Error(`فحص السلامة أعاد: ${integrity}`);
    }

    const backupTables = tableNames(backup);
    const missing = CORE_TABLES.filter((t) => !backupTables.includes(t));
    if (missing.length > 0) {
      throw new Error(`جداول مفقودة في النسخة الاحتياطية: ${missing.join(', ')}`);
    }

    const srcCounts = rowCounts(src, CORE_TABLES);
    const backupCounts = rowCounts(backup, CORE_TABLES);

    console.log('فحص السلامة: ok');
    console.log('عدد الصفوف (المصدر / النسخة الاحتياطية):');
    for (const t of CORE_TABLES) {
      console.log(`  ${t}: ${srcCounts[t]} / ${backupCounts[t]}`);
    }

    const size = fs.statSync(destPath).size;
    console.log(`اكتمل النسخ الاحتياطي بنجاح (${size} بايت): ${destPath}`);
    return 0;
  } catch (err) {
    console.error(`النسخة الاحتياطية غير سليمة: ${err.message}`);
    fs.rmSync(destPath, { force: true });
    return 1;
  } finally {
    if (backup) backup.close();
    if (src) src.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`خطأ غير متوقع: ${err.message}`);
    process.exit(1);
  }
);
