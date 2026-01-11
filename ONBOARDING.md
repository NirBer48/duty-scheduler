# חפיפה למערכת MyTurn

## תוכן עניינים
1. [הקדמה ורקע](#הקדמה-ורקע)
2. [תכונות המערכת](#תכונות-המערכת)
3. [מבנה הפרויקט](#מבנה-הפרויקט)
4. [ארכיטקטורה](#ארכיטקטורה)
5. [API Endpoints](#api-endpoints)
6. [מבנה מסד הנתונים](#מבנה-מסד-הנתונים)
7. [התחלת עבודה](#התחלת-עבודה)
8. [תהליך פיתוח](#תהליך-פיתוח)

---

## הקדמה ורקע

בשבוע השני של מחזור 91 בגדוד ארז, אני (ניר ברקוביץ) חוויתי איך נראה שיבוץ ידני להגנ"מ פלוגתי. זה היה מופע מבולגן, מלא בבלת"מים, חסר סדר וגוזל זמן!
חזרתי הביתה באותו שבוע וחשבתי על רעיון שאני יכול לממש בעצמי כדי שהמופע הזה לא יחזור על עצמו. הרעיון הזה הוא המערכת הזו, שאחרי 5 שבועות הפכה להיות מבצעית ובשימוש על ידי הקמב"צים בכלל הפלוגות בגדוד!

למערכת הזו יש עוד הרבה מקום לשיפור, ופוטנציאל להטמעה בכל הגדודים בבהד עוד במחזור שלכם (ארז 92)
יש הרבה עבודה ותפקיד הצוות שלכם הוא למנף את המערכת ולקדם אותה לפי הצרכים של הקמב"צים הפלוגתיים.
יש עוד כמות נכבדת של פיצ'רים שנשארה לפיתוח עוד מהמחזור שלנו, תתעדפו בעצמכם את החשיבות של כל משימה ותקבעו לעצמכם יעדים.
שיהיה לכם המון בהצלחה, ואני אהיה זמין ככל הניתן לכל שאלה שלכם!

##### נקודות חשובות:
  * רוב המערכת נכתבה בעזרת כלי AI כמו cursor וAntiGravity. ממליץ בחום גם לכם להמשיך את הפיתוח בתצורה הזו.
  * ניהול המשימות מתקיים באתר (https://app.clickup.com/9018095155/v/s/90188706346)[clickup] והפיתוח בgithub. כדי לקבל הרשאות פנו אלי ושלחו לי את מייל שלכם.

### הרעיון המרכזי
המערכת נועדה לפשט את תהליך יצירת פק"ש מורכב הכולל:
- ניהול מספר רב של אנשים ותפקידים
- שמירה על כללי מנוחה בין משמרות
- התחשבות בהעדפות אישיות ואילוצים
- ניהול כ"כ - כיתת כוננות
- יצירת לוחות זמנים מאוזנים והוגנים
- שיבוץ מספר תורנויות במקביל

### הבעיה שהמערכת פותרת
יצירת לוח זמנים ידנית היא תהליך מורכב, זמן רב, ונוטה לשגיאות. המערכת מספקת:
- **אוטומציה מלאה** - יצירת לוח זמנים אופטימלי בלחיצת כפתור
- **ולידציה בזמן אמת** - בדיקת כללים ואילוצים לפני שמירה
- **גמישות** - אפשרות לעריכה ידנית לאחר יצירה אוטומטית
- **שקיפות** - תצוגה ברורה של חלוקת העבודה וטבלת צדק

---

## תכונות המערכת

### 1. ניהול אנשים (People Management)
- **הוספה/מחיקה** של אנשים עם פרטים:
  - שם
  - מגדר (ז/נ/X)
  - העדפת מגדר זהה (sameGenderPref)
  - יכולת מוגבלת (limitedAbility) - למניעת שיבוץ בקבוצות כ"כ
  - פטור מעמידה (standingExemption)
  - שמירה בזוג (duelGuard)
  - פטור משמירה לילית (nightGuardExemption)
  - פטור מאסטמה (asthmaExemption) - מאפשר שיבוץ רק בתפקיד "תצפיתן"
  - פטור ממטבח (kitchenExemption)

- **ייבוא מאקסל** - ייבוא אנשים מקובץ Excel עם תמיכה בעמודות של פאטי האנשים

### 2. ניהול עמדות שמירה (Posts Management)
- יצירה ועריכה של עמדות
- הגדרת מספר אנשים נדרש לכל משמרת

### 3. יצירת לוח פק"ש (Schedule Generation)

#### סוגי לוחות זמנים:
- **לוח זמנים כללי** - כולל שמירות, עב"ס, מטבח, ליווי קבלנים, רס"ר, ליווי קבלנים בקומת 400
- **לוח זמנים לשמירות בלבד** - יצירה נפרדת לשמירות
- **לוח זמנים למטבח** - יצירה נפרדת למטבח וליווי קבלנים
- **לוח זמנים לרס"ר** - יצירה נפרדת לרס"ר וליווי בקומת 400

#### כללי יצירה:
- **כלל 8 שעות מנוחה** - מינימום 8 שעות (2 משמרות) בין משמרות
- **חלוקה שווה** - פיזור שווה של משמרות בין כל האנשים
- **העדפות מגדר** - כיבוד העדפות מגדר זהה
- **מניעת חפיפות** - בדיקה שכל אדם לא משובץ בשני תפקידים באותה שעה
- **אילוצים** - התחשבות באילוצים אישיות (פטורים, העדפות)

#### מצבי יצירה:
- **יצירה מלאה** - דורשת מילוי מלא של כל התפקידים
- **יצירה חלקית** (allowPartial) - מאפשרת יצירת לוח זמנים עם תאים ריקים

### 4. קבוצות כ"כ (ES Groups - כיתת כוננות)
- שתי קבוצות מיוחדות המכסות את כל תקופת הלוח זמנים
- הגדרת מספר כולל של אנשים בקבוצה
- כלל: רק אדם אחד מכל קבוצה יכול להיות פעיל בכל משמרת
- חברי קבוצה יכולים להיות משובצים גם במשמרות רגילות (עם ולידציה)

### 5. סוגי תורנויות

#### שמירות (Guards)
- משמרות של 4 שעות: 00:00-04:00, 04:00-08:00, 08:00-12:00, 12:00-16:00, 16:00-20:00, 20:00-00:00
- שיבוץ לפי עמדות (posts)
- תמיכה ב-overrides למשמרות ספציפיות

#### עב"ס (BW)
- 3 משמרות קבועות:
  - בוקר: 08:30-11:30 (3 שעות)
  - צהריים: 13:30-17:30 (4 שעות)
  - ערב: 18:30-20:00 (1.5 שעות)
- 20 אנשים נדרשים לכל משמרת (ניתן לשנות ב-VITE_BW_REQUIRED)

#### מטבח (Kitchen)
- משמרות דינמיות המכסות 06:00-21:00
- הגדרת משמרות מותאמת אישית עם:
  - זמני התחלה וסיום
  - מספר אנשים נדרש לכל משמרת
- משמרות חייבות להיות רציפות וללא פערים
- תמיכה במספר משמרות (לא רק 2)

#### ליווי קבלנים(Escort)
- 4 משמרות קבועות:
  - משמרת 1: 07:00-10:30
  - משמרת 2: 10:30-14:00
  - משמרת 3: 14:00-17:00
  - משמרת 4: 17:00-19:00
- הגדרת מספר אנשים נדרש לכל משמרת

#### רס"ר (Rasar)
- 3 משמרות קבועות:
  - רס"ר 1: 08:30-11:30
  - רס"ר 2: 13:30-17:30
  - רס"ר 3: 19:30-20:30
- תמיכה ב-overrides למשמרות ספציפיות

#### ליווי קבלנים בקומת 400 (Escort 400)
- 2 משמרות קבועות:
  - ליווי 400 1: 08:00-12:30
  - ליווי 400 2: 12:30-17:00
- כלל: רק צוערות (F) יכולות להיות משובצות
- תמיכה ב-overrides למשמרות ספציפיות

### 6. עריכה ידנית
- עריכה של תאים בודדים בלוח הזמנים
- עריכה של קבוצות כ"כ
- עריכה של משמרות עב"ס
- עריכה של משמרות מטבח וליווי קבלנים
- עריכה של משמרות רס"ר וליווי קבלנים בקומת 400
- ולידציה בזמן אמת בעת עריכה

### 7. אילוצים (Constraints)
- הוספת אילוצי זמן לאנשים ספציפיים
- התחשבות באילוצים בעת יצירת לוח
- מניעת שיבוץ במשמרות חופפות לאילוצים

### 8. היסטוריה וארכיון
- שמירת לוחות זמנים קודמים
- תצוגת היסטוריה לפי תקופות
- חישוב שעות עבודה מהיסטוריה

### 9. טבלת צדק (Justice Table)
- תצוגה של חלוקת שעות עבודה בין כל האנשים
- חישוב לפי סוגי תורנויות:
  - שמירות
  - עב"ס
  - מטבח
  - ליווי
  - רס"ר
  - ליווי קבלנים 400
- תמיכה בחישוב לפי טווח תאריכים

### 10. ייצוא ל-Excel
- ייצוא לוח זמנים כללי ל-Excel עם עיצוב
- ייצוא לוח זמנים למטבח ל-Excel
- צבעים:
  - 🟢 ירוק - מלא
  - 🟠 כתום - חלקי
  - 🔴 אדום - ריק

### 11. בינלאומיות (i18n)
- תמיכה מלאה בעברית ואנגלית
- ממשק RTL לעברית
- החלפת שפה דינמית

---

## מבנה הפרויקט

```
duty-scheduler/
├── client/                          # Frontend - React + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── schedule/           # רכיבי לוח זמנים
│   │   │   │   ├── BWEditDialog.tsx         # עריכת עב"ס
│   │   │   │   ├── CellEditDialog.tsx       # עריכת תא בודד
│   │   │   │   ├── DutyEditDialog.tsx       # עריכת תורנות
│   │   │   │   ├── DutyShiftSettingsDialog.tsx  # הגדרות משמרת
│   │   │   │   ├── ESEditDialog.tsx         # עריכת קבוצות כ"כ
│   │   │   │   ├── ShiftSettingsDialog.tsx  # הגדרות משמרות
│   │   │   │   ├── dutyCounts.ts            # חישוב ספירת תורנויות
│   │   │   │   ├── excelExport.ts            # ייצוא ל-Excel
│   │   │   │   ├── utils.ts                 # פונקציות עזר
│   │   │   │   └── index.ts
│   │   │   ├── ConstraintsEditor.tsx         # עריכת אילוצים
│   │   │   ├── HistoryView.tsx              # תצוגת היסטוריה
│   │   │   ├── JusticeTableView.tsx          # טבלת צדק
│   │   │   ├── KitchenDutyView.tsx          # תצוגת מטבח
│   │   │   ├── ManpowerShortageDialog.tsx   # דיאלוג מחסור בכוח אדם
│   │   │   ├── PeopleEditor.tsx             # עריכת אנשים
│   │   │   ├── PostsEditor.tsx              # עריכת תפקידים
│   │   │   ├── RasarDutyView.tsx            # תצוגת רס"ר
│   │   │   └── ScheduleView.tsx              # תצוגת לוח זמנים ראשי
│   │   ├── util/
│   │   │   └── i18n.tsx                     # בינלאומיות
│   │   ├── api.ts                          # לקוח API
│   │   ├── types.ts                        # הגדרות TypeScript
│   │   ├── App.tsx                         # רכיב ראשי
│   │   └── main.tsx                        # נקודת כניסה
│   ├── public/
│   │   └── logo.png
│   ├── Dockerfile
│   ├── nginx.conf                         # הגדרות Nginx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── server/                              # Backend - Node.js + Express
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js                  # אימות והרשמה
│   │   │   ├── people.js                 # ניהול אנשים
│   │   │   ├── posts.js                  # ניהול תפקידים
│   │   │   ├── constraints.js            # ניהול אילוצים
│   │   │   └── schedule.js               # ניהול לוחות זמנים
│   │   ├── middleware/
│   │   │   └── auth.js                   # Middleware לאימות
│   │   ├── scheduler.js                  # אלגוריתם יצירת לוח זמנים
│   │   ├── migrate.js                    # מיגרציות מסד נתונים
│   │   ├── db.js                         # חיבור למסד נתונים
│   │   └── index.js                      # שרת Express
│   ├── migrations/
│   │   └── init.sql                      # סכמת מסד נתונים
│   ├── data/
│   │   └── duty.db                       # מסד נתונים מקומי (אם לא PostgreSQL)
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml                    # הגדרות Docker Compose
├── deploy.bat                           # סקריפט פריסה (Windows)
├── deploy.ps1                           # סקריפט פריסה (PowerShell)
├── README.md                            # תיעוד ראשי
└── ONBOARDING.md                        # מסמך זה
```

---

## ארכיטקטורה

### Frontend Architecture

#### טכנולוגיות:
- **React 18** - ספריית UI
- **TypeScript** - טייפ-ספייפינג
- **Material-UI (MUI)** - רכיבי UI
- **Vite** - כלי בנייה
- **dayjs** - מניפולציה של תאריכים
- **xlsx-js-style** - ייצוא Excel עם עיצוב
- **stylis + stylis-plugin-rtl** - תמיכה ב-RTL

#### מבנה:
- **Component-based** - כל תכונה היא רכיב נפרד
- **State Management** - שימוש ב-React hooks (useState, useEffect, useMemo)
- **API Client** - קובץ `api.ts` מרכזי לכל קריאות ה-API
- **Type Safety** - הגדרות TypeScript מלאות ב-`types.ts`
- **i18n** - מערכת בינלאומיות מותאמת אישית

#### תזרים נתונים:
```
User Action → Component → API Call → Backend → Database
                ↓
         State Update → UI Re-render
```

### Backend Architecture

#### טכנולוגיות:
- **Node.js** - סביבת ריצה
- **Express** - מסגרת שרת
- **PostgreSQL** - מסד נתונים
- **JWT** - אימות
- **bcryptjs** - הצפנת סיסמאות
- **dayjs** - מניפולציה של תאריכים

#### מבנה:
- **RESTful API** - ארכיטקטורת REST
- **Route-based** - כל נושא בנתיב נפרד
- **Middleware** - אימות באמצעות middleware
- **Database Abstraction** - שכבת הפשטה למסד נתונים

#### תזרים בקשה:
```
HTTP Request → Express Middleware → Route Handler → Database Query
                                                          ↓
Response ← JSON ← Route Handler ← Database Result
```

### Database Architecture

#### PostgreSQL Schema:
- **Multi-tenant** - כל טבלה כוללת `userId` לבידוד משתמשים
- **Normalized** - מבנה מנורמל עם foreign keys
- **Archive Tables** - טבלאות נפרדות לארכיון היסטורי
- **Indexes** - אינדקסים על שדות חיפוש נפוצים

#### טבלאות עיקריות:
- `users` - משתמשים
- `people` - אנשים
- `posts` - תפקידים
- `assignments` - שיבוצי שמירות
- `bw_assignments` - שיבוצי עב"ס
- `kitchen_assignments` - שיבוצי מטבח
- `escort_assignments` - שיבוצי ליווי
- `rasar_assignments` - שיבוצי רס"ר
- `escort400_assignments` - שיבוצי ליווי 400
- `es_assignments` - שיבוצי קבוצות כ"כ
- `kitchen_shifts` - הגדרות משמרות מטבח
- `kitchen_settings` - הגדרות מטבח (legacy)
- `escort_settings` - הגדרות ליווי
- `constraints` - אילוצים
- `archived_*` - טבלאות ארכיון

---

## API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - הרשמה
  - Body: `{ email, password }`
  - Response: `{ id, email }`
  
- `POST /api/auth/login` - התחברות
  - Body: `{ email, password }`
  - Response: `{ id, email }`
  - Sets cookie: `auth_token`

- `POST /api/auth/logout` - התנתקות
  - Response: `{ ok: true }`

- `GET /api/auth/me` - מידע משתמש נוכחי
  - Response: `{ id, email }`

### People (`/api/people`) - דורש אימות
- `GET /api/people` - רשימת כל האנשים
  - Response: `Array<Person>`

- `POST /api/people` - הוספת אדם
  - Body: `{ name, gender, sameGenderPref?, limitedAbility?, standingExemption?, duelGuard?, nightGuardExemption?, asthmaExemption?, kitchenExemption? }`
  - Response: `Person`

- `DELETE /api/people/:id` - מחיקת אדם
  - Response: `{ ok: true }`

### Posts (`/api/posts`) - דורש אימות
- `GET /api/posts` - רשימת כל התפקידים
  - Response: `Array<Post>`

- `POST /api/posts` - הוספת תפקיד
  - Body: `{ name, requiredPerShift?, optional? }`
  - Response: `Post`

- `DELETE /api/posts/:id` - מחיקת תפקיד
  - Response: `{ ok: true }`

### Constraints (`/api/constraints`) - דורש אימות
- `GET /api/constraints` - רשימת כל האילוצים
  - Response: `Array<Constraint>`

- `POST /api/constraints` - הוספת מגבלה
  - Body: `{ personId, title, startISO, endISO }`
  - Response: `Constraint`

- `DELETE /api/constraints/:id` - מחיקת מגבלה
  - Response: `{ ok: true }`

### Schedule (`/api/schedule`) - דורש אימות

#### יצירת לוחות זמנים:
- `POST /api/schedule/generate` - יצירת לוח זמנים מלא
  - Body: `{ startISO, endISO, shiftOverrides?, esAssignments?, existingAssignments?, existingBwAssignments?, existingKitchenAssignments?, existingEscortAssignments?, existingRasarAssignments?, existingEscort400Assignments?, kitchenSettings?, escortSettings?, constraints? }`
  - Response: `{ assignments, bwAssignments, esAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments, kitchenSettings, escortSettings }`

- `POST /api/schedule/generate-guards` - יצירת לוח זמנים לשמירות בלבד
  - Body: `{ startISO, endISO, shiftOverrides?, esAssignments?, existingAssignments?, existingBwAssignments?, existingKitchenAssignments?, existingEscortAssignments?, existingRasarAssignments?, existingEscort400Assignments?, kitchenSettings?, escortSettings?, constraints?, allowPartial? }`
  - Response: `{ assignments, bwAssignments, esAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments }`

- `POST /api/schedule/generate-kitchen` - יצירת לוח זמנים למטבח וליווי
  - Body: `{ startISO, endISO, kitchenStartISO?, kitchenEndISO?, kitchenDay?, esAssignments?, existingAssignments?, existingBwAssignments?, existingKitchenAssignments?, existingEscortAssignments?, existingRasarAssignments?, existingEscort400Assignments?, kitchenSettings?, escortSettings?, constraints?, allowPartial? }`
  - Response: `{ assignments, bwAssignments, esAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments, kitchenSettings, escortSettings }`

- `POST /api/schedule/generate-rasar` - יצירת לוח זמנים לרס"ר וליווי 400
  - Body: `{ startISO, endISO, rasarStartISO?, rasarEndISO?, rasarOverrides?, escort400Overrides?, esAssignments?, existingAssignments?, existingBwAssignments?, existingKitchenAssignments?, existingEscortAssignments?, existingRasarAssignments?, existingEscort400Assignments?, kitchenSettings?, escortSettings?, constraints?, allowPartial? }`
  - Response: `{ assignments, bwAssignments, esAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments, kitchenSettings, escortSettings }`

#### שמירה ועריכה:
- `POST /api/schedule/save-all` - שמירת לוח זמנים מלא
  - Body: `{ assignments, bwAssignments, esAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments, kitchenSettings, escortSettings, start, end }`
  - Response: `{ ok: true }`

- `POST /api/schedule/save-rasar` - שמירת שיבוצי רס"ר וליווי 400
  - Body: `{ rasarAssignments, escort400Assignments }`
  - Response: `{ ok: true }`

- `POST /api/schedule/update-cell` - עדכון תא בודד
  - Body: `{ postId, day, shiftLabel, personIds }`
  - Response: `{ ok: true, assignments }`

#### קריאה:
- `GET /api/schedule/last` - קבלת לוח הזמנים האחרון
  - Response: `{ assignments, bwAssignments, esAssignments, kitchenAssignments, escortAssignments, rasarAssignments, escort400Assignments, kitchenSettings, escortSettings }`

- `GET /api/schedule/history-periods` - רשימת תקופות היסטוריות
  - Response: `{ periods: Array<{ start, end }> }`

- `GET /api/schedule/history?start=YYYY-MM-DD&end=YYYY-MM-DD` - קבלת לוח זמנים היסטורי
  - Response: `{ assignments, bwAssignments, esAssignments, kitchenAssignments, escortAssignments, kitchenSettings, escortSettings }`

- `GET /api/schedule/justice?mode=all|range&startISO=...&endISO=...` - טבלת צדק
  - Response: `{ rows: Array<{ personId, name, guardsHours, bwHours, kitchenHours, escortHours, rasarHours, escort400Hours, totalHours }> }`

#### מחיקה:
- `DELETE /api/schedule/clear?mode=all|guards|kitchen|rasar&start=YYYY-MM-DD&end=YYYY-MM-DD` - מחיקת לוח זמנים
  - Response: `{ ok: true }`

### Health Check
- `GET /api/health` - בדיקת תקינות שרת
  - Response: `{ ok: true }`

---

## מבנה מסד הנתונים

### טבלאות עיקריות

#### users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
```

#### people
```sql
CREATE TABLE people (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  sameGenderPref BOOLEAN DEFAULT false,
  limitedAbility BOOLEAN DEFAULT false,
  standingExemption BOOLEAN DEFAULT false,
  duelGuard BOOLEAN DEFAULT false,
  nightGuardExemption BOOLEAN DEFAULT false,
  asthmaExemption BOOLEAN DEFAULT false,
  kitchenExemption BOOLEAN DEFAULT false,
  userId INTEGER REFERENCES users(id)
);
```

#### posts
```sql
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  requiredPerShift INTEGER DEFAULT 1,
  optional BOOLEAN DEFAULT false,
  userId INTEGER REFERENCES users(id)
);
```

#### assignments (שמירות)
```sql
CREATE TABLE assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  postId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftLabel TEXT NOT NULL,
  startISO TEXT,
  endISO TEXT,
  userId INTEGER REFERENCES users(id)
);
```

#### bw_assignments
```sql
CREATE TABLE bw_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  slotId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

#### kitchen_assignments
```sql
CREATE TABLE kitchen_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

#### kitchen_shifts
```sql
CREATE TABLE kitchen_shifts (
  id SERIAL PRIMARY KEY,
  shiftId TEXT NOT NULL,
  idx INTEGER NOT NULL,
  startHHmm TEXT NOT NULL,
  endHHmm TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 36,
  userId INTEGER REFERENCES users(id),
  UNIQUE(userId, shiftId),
  UNIQUE(userId, idx)
);
```

#### escort_assignments
```sql
CREATE TABLE escort_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

#### escort_settings
```sql
CREATE TABLE escort_settings (
  id SERIAL PRIMARY KEY,
  requiredPerShift INTEGER NOT NULL DEFAULT 4,
  requiredShift1 INTEGER NOT NULL DEFAULT 4,
  requiredShift2 INTEGER NOT NULL DEFAULT 4,
  requiredShift3 INTEGER NOT NULL DEFAULT 4,
  requiredShift4 INTEGER NOT NULL DEFAULT 4,
  userId INTEGER REFERENCES users(id)
);
```

#### rasar_assignments
```sql
CREATE TABLE rasar_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

#### escort400_assignments
```sql
CREATE TABLE escort400_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

#### es_assignments (קבוצות כ"כ)
```sql
CREATE TABLE es_assignments (
  id SERIAL PRIMARY KEY,
  groupId TEXT NOT NULL,
  personId INTEGER NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

#### constraints
```sql
CREATE TABLE constraints (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  title TEXT NOT NULL,
  startISO TEXT NOT NULL,
  endISO TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

### טבלאות ארכיון

כל טבלת assignments יש לה טבלת ארכיון מקבילה:
- `archived_assignments`
- `archived_bw_assignments`
- `archived_kitchen_assignments`
- `archived_escort_assignments`
- `archived_rasar_assignments`
- `archived_escort400_assignments`
- `archived_es_assignments`
- `archived_kitchen_shifts`
- `archived_kitchen_settings`
- `archived_escort_settings`

כל טבלת ארכיון כוללת:
- `schedule_start` - תחילת תקופת הלוח זמנים
- `schedule_end` - סיום תקופת הלוח זמנים
- כל השדות מהטבלה המקורית

---

## התחלת עבודה

### דרישות מוקדמות
- Node.js 18+
- npm או yarn
- PostgreSQL 15+ (או Docker)
- Docker & Docker Compose (לפריסה)

### התקנה מקומית

#### 1. שכפול הפרויקט
```bash
git clone <repository-url>
cd duty-scheduler
```

#### 2. הגדרת Backend
```bash
cd server
npm install
```

#### 3. הגדרת מסד נתונים
צור קובץ `.env` בתיקיית `server/`:
```env
DATABASE_URL=postgres://user:password@localhost:5432/duty
AUTH_SECRET=your-secret-key-here
NODE_ENV=development
```

הרץ מיגרציות:
```bash
npm run migrate
```

#### 4. הפעלת שרת
```bash
npm start
```
השרת ירוץ על http://localhost:4000

#### 5. הגדרת Frontend
```bash
cd client
npm install
```

#### 6. הפעלת Frontend
```bash
npm run dev
```
הפרונטאנד ירוץ על http://localhost:3000

### פריסה עם Docker

```bash
docker compose up --build
```

הגישה לאפליקציה:
- **Frontend**: http://localhost
- **Backend API**: http://localhost:4000/api

להרצה ברקע:
```bash
docker compose up -d --build
```

לעצירה:
```bash
docker compose down
```

---

## תהליך פיתוח

### כללי עבודה
1. **ענפים** - עבוד על ענף נפרד לכל תכונה
2. **Commits** - כתוב הודעות commit ברורות
3. **Testing** - בדוק את השינויים לפני commit
4. **Code Review** - בקש review לפני merge

### הוספת תכונה חדשה

#### Frontend:
1. צור רכיב חדש ב-`client/src/components/`
2. הוסף types ב-`client/src/types.ts` (אם נדרש)
3. עדכן את `client/src/App.tsx` (אם נדרש)
4. הוסף API calls ב-`client/src/api.ts` (אם נדרש)

#### Backend:
1. הוסף route ב-`server/src/routes/` (אם נדרש)
2. עדכן את `server/src/index.js` (אם נדרש)
3. עדכן את `server/src/scheduler.js` (אם נדרש)
4. הוסף מיגרציה ב-`server/migrations/` (אם נדרש)

### כללי קוד

#### TypeScript/JavaScript:
- השתמש ב-TypeScript ב-frontend
- השתמש ב-ES Modules
- כתוב קוד נקי וקריא
- הוסף הערות במקומות מורכבים

#### Database:
- כל טבלה חייבת לכלול `userId` לבידוד משתמשים
- השתמש ב-prepared statements למניעת SQL injection
- הוסף אינדקסים על שדות חיפוש

#### API:
- השתמש ב-HTTP status codes נכונים
- החזר JSON עקבי
- הוסף error handling

### Debugging

#### Frontend:
- השתמש ב-React DevTools
- בדוק את Console בדפדפן
- בדוק Network tab ל-API calls

#### Backend:
- בדוק את Console של השרת
- השתמש ב-PostgreSQL logs
- בדוק את Network tab ב-frontend

### כללי ביטחון
- לעולם אל תאחסן סיסמאות בטקסט פשוט
- השתמש ב-JWT לאימות
- בדוק הרשאות בכל endpoint
- סניטיזציה של קלט משתמש

---

## משאבים נוספים

- **README.md** - תיעוד ראשי באנגלית
- **מסמכי קוד** - הערות בקוד
- **Git History** - היסטוריית שינויים

---

**בהצלחה בפיתוח! 🚀**

