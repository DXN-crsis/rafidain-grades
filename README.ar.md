[English](README.md) · **العربية**

# منصة نتائج إعدادية الرافدين المهنية

يستعلم الطالب عن نتيجته برقمه الامتحاني السري، وتدير الإدارة الأقسام والمراحل والشعب والمواد والدرجات من لوحة التحكم.

## <img src="https://api.iconify.design/octicon/terminal-16.svg?color=%238b949e&height=18" align="top"> التشغيل محليًا

```bash
npm install
npm start
```

ثم افتح http://localhost:3000

## <img src="https://api.iconify.design/octicon/key-16.svg?color=%238b949e&height=18" align="top"> حساب الإدارة

القيم الافتراضية:

- المستخدم: `admin`
- كلمة المرور: `rafidain@2026`

> [!IMPORTANT]
> غيّرها قبل النشر عبر متغيرات البيئة:
>
> ```bash
> ADMIN_USER=... ADMIN_PASS=... npm start
> ```
>
> تُطبَّق عند أول تشغيل فقط، قبل إنشاء `data/grades.sqlite`.

## <img src="https://api.iconify.design/octicon/beaker-16.svg?color=%238b949e&height=18" align="top"> الاختبارات

```bash
npm test
```

## <img src="https://api.iconify.design/octicon/rocket-16.svg?color=%238b949e&height=18" align="top"> النشر

دليل النشر على Railway مع النسخ الاحتياطي والاستعادة واستكشاف الأخطاء في [`docs/دليل-النشر.md`](docs/دليل-النشر.md).

> [!WARNING]
> اربط قرص تخزين دائم على `/data` واضبط `DB_PATH=/data/grades.sqlite`. بدونه تُمسح البيانات مع كل نشر.

التشغيل المحلي لا يحتاج أي إعداد إضافي.

## <img src="https://api.iconify.design/octicon/database-16.svg?color=%238b949e&height=18" align="top"> النسخ الاحتياطي

```bash
npm run backup
```

يحفظ لقطة متحقَّق منها في `backups/grades-backup-التاريخ.sqlite`. آمن أثناء عمل الخادم. خطوات الاستعادة في دليل النشر.
