const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  UNIQUE(name, department_id)
);
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  UNIQUE(name, stage_id)
);
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  grade_mode TEXT NOT NULL DEFAULT 'full' CHECK (grade_mode IN ('full','final_only')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(name, stage_id)
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  exam_number TEXT UNIQUE NOT NULL,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  first_term_avg REAL,
  midyear REAL,
  second_term_avg REAL,
  annual_effort REAL,
  final_exam REAL,
  final_grade REAL,
  UNIQUE(student_id, subject_id)
);
`;

function createDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  const count = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (count === 0) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASS || 'rafidain@2026';
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
      .run(username, bcrypt.hashSync(password, 10));
  }

  const admins = db.prepare('SELECT password_hash FROM admins').all();
  if (admins.some((a) => bcrypt.compareSync('rafidain@2026', a.password_hash))) {
    console.warn('تحذير: كلمة مرور المدير الافتراضية ما زالت قيد الاستخدام، يرجى تغييرها فوراً');
  }

  return db;
}

module.exports = { createDb };
