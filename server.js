const path = require('node:path');
const { createApp } = require('./src/app');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'grades.sqlite');
require('node:fs').mkdirSync(path.dirname(dbPath), { recursive: true });

const app = createApp({ dbPath });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`منصة الرافدين تعمل على http://localhost:${port}`));
