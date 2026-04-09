# MyTurn (סידור תורנויות)

A comprehensive web application for scheduling people across multiple duty types with support for guards, kitchen, escort, BW, Rasar, and special duty groups (כ"כ). Features automatic schedule generation, manual editing, history tracking, and justice table for fair work distribution.

![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Node.js](https://img.shields.io/badge/Node.js-18-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

## Features

### People Management
- Add/delete people with comprehensive attributes:
  - Name and gender (M/F/X)
  - Same-gender preference (sameGenderPref)
  - Limited ability (limitedAbility) - prevents assignment to כ"כ groups
  - Standing exemption (standingExemption)
  - Duel guard (duelGuard)
  - Night guard exemption (nightGuardExemption)
  - Asthma exemption (asthmaExemption) - allows only "תצפיתן" post
  - Kitchen exemption (kitchenExemption)
- Import people from Excel (.xlsx) files
- Same-gender preference ensures pairing only with same gender

### Posts Management
- Create multiple posts/stations that need staffing
- Configure required people per shift for each post
- Optional posts flag
- Override requirements for specific shifts

### Schedule Generation

#### Multiple Schedule Types:
- **Full Schedule** - Complete schedule including all duty types
- **Guards Only** - Generate guards schedule separately
- **Kitchen & Escort** - Generate kitchen and escort schedule separately
- **Rasar & Escort 400** - Generate Rasar and Escort 400 schedule separately

#### Generation Modes:
- **Full Mode** - Requires complete staffing (default)
- **Partial Mode** (allowPartial) - Allows empty cells when insufficient manpower

#### Automatic Constraints:
- **8-hour rest rule**: Minimum 8 hours between shifts (2 shift gap)
- **Equal distribution**: Spreads shifts evenly among all people
- **Same-gender pairing**: Respects gender preferences when pairing
- **No overlaps**: Prevents double-booking of people
- **Constraint respect**: Honors time constraints for individuals
- **Exemption rules**: Respects all exemption flags

### Duty Types

#### Guards (שמירות)
- 4-hour shifts: 00:00-04:00, 04:00-08:00, 08:00-12:00, 12:00-16:00, 16:00-20:00, 20:00-00:00
- Assignment by posts
- Support for shift-specific overrides

#### BW (ביטחון וסדר)
- 3 fixed shifts:
  - Morning: 08:30-11:30 (3 hours)
  - Afternoon: 13:30-17:30 (4 hours)
  - Evening: 18:30-20:00 (1.5 hours)
- 20 people required per shift (configurable via `VITE_BW_REQUIRED`)

#### Kitchen (מטבח)
- Dynamic shifts covering 06:00-21:00
- Customizable shift definitions with:
  - Start and end times
  - Required people per shift
- Shifts must be contiguous without gaps
- Support for multiple shifts (not just 2)

#### Escort (ליווי)
- 4 fixed shifts:
  - Shift 1: 07:00-10:30
  - Shift 2: 10:30-14:00
  - Shift 3: 14:00-17:00
  - Shift 4: 17:00-19:00
- Configurable required people per shift

#### Rasar (רס"ר)
- 3 fixed shifts:
  - Rasar 1: 08:30-11:30
  - Rasar 2: 13:30-17:30
  - Rasar 3: 19:30-20:30
- Support for shift-specific overrides

#### Escort 400 (ליווי 400)
- 2 fixed shifts:
  - Escort 400 1: 08:00-12:30
  - Escort 400 2: 12:30-17:00
- Rule: Only females (F) can be assigned
- Support for shift-specific overrides

### ES Groups (כ"כ - כיתת כוננות)
- Two special duty groups that span the entire schedule period
- Configurable total people per group (default: 5 and 4)
- Rule: Only 1 person from each group can be active per shift
- Members can also be assigned to regular shifts (with validation)

### Manual Editing
- Edit individual cells in schedule
- Edit ES groups
- Edit BW shifts
- Edit kitchen and escort shifts
- Edit Rasar and Escort 400 shifts
- Real-time validation during editing

### Constraints
- Add time constraints for specific people
- Constraints are considered during schedule generation
- Prevents assignment during constraint periods

### History & Archive
- Save previous schedules
- View history by periods
- Calculate work hours from history

### Justice Table (טבלת צדק)
- View work hour distribution among all people
- Calculate by duty type:
  - Guards hours
  - BW hours
  - Kitchen hours
  - Escort hours
  - Rasar hours
  - Escort 400 hours
  - Total hours
- Support for date range calculation

### Export & Import
- Export full schedule to styled Excel (.xlsx)
- Export kitchen schedule to Excel
- Color-coded cells:
  - 🟢 Green - Fully staffed
  - 🟠 Orange - Partially staffed
  - 🔴 Red - Empty
- Import people from Excel with columns: `name`, `gender`, `sameGenderPref`, `limitedAbility`

### Internationalization
- Full support for English and Hebrew (עברית)
- RTL layout for Hebrew using stylis-plugin-rtl
- Language toggle in the app bar

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Material-UI (MUI)** for components and styling
- **Vite** for build tooling
- **xlsx-js-style** for Excel export with styling
- **dayjs** for date manipulation
- **stylis** + **stylis-plugin-rtl** for RTL support
- **@emotion/react** for CSS-in-JS

### Backend
- **Node.js** with Express
- **PostgreSQL** for database
- **JWT** for authentication
- **bcryptjs** for password hashing
- **dayjs** for date manipulation
- **ES Modules** syntax

### Infrastructure
- **Docker** & Docker Compose for containerization
- **Nginx** for serving frontend in production

## Project Structure

```
duty-scheduler/
├── client/                          # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── schedule/           # Schedule-related components
│   │   │   │   ├── BWEditDialog.tsx
│   │   │   │   ├── CellEditDialog.tsx
│   │   │   │   ├── DutyEditDialog.tsx
│   │   │   │   ├── DutyShiftSettingsDialog.tsx
│   │   │   │   ├── ESEditDialog.tsx
│   │   │   │   ├── ShiftSettingsDialog.tsx
│   │   │   │   ├── dutyCounts.ts
│   │   │   │   ├── excelExport.ts
│   │   │   │   ├── utils.ts
│   │   │   │   └── index.ts
│   │   │   ├── ConstraintsEditor.tsx
│   │   │   ├── HistoryView.tsx
│   │   │   ├── JusticeTableView.tsx
│   │   │   ├── KitchenDutyView.tsx
│   │   │   ├── ManpowerShortageDialog.tsx
│   │   │   ├── PeopleEditor.tsx
│   │   │   ├── PostsEditor.tsx
│   │   │   ├── RasarDutyView.tsx
│   │   │   └── ScheduleView.tsx
│   │   ├── util/
│   │   │   └── i18n.tsx            # Internationalization
│   │   ├── api.ts                  # API client
│   │   ├── types.ts                # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   └── logo.png
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── index.html
│   └── package.json
│
├── server/                          # Node.js backend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js             # Authentication
│   │   │   ├── people.js           # People management
│   │   │   ├── posts.js             # Posts management
│   │   │   ├── constraints.js      # Constraints management
│   │   │   └── schedule.js         # Schedule management
│   │   ├── middleware/
│   │   │   └── auth.js             # Authentication middleware
│   │   ├── scheduler.js            # Schedule generation algorithm
│   │   ├── migrate.js               # Database migration
│   │   ├── db.js                   # Database connection
│   │   └── index.js                # Express server
│   ├── migrations/
│   │   └── init.sql                # Database schema
│   ├── data/
│   │   └── duty.db                 # Local DB (if not PostgreSQL)
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
├── deploy.bat                       # Deployment script (Windows)
├── deploy.ps1                       # Deployment script (PowerShell)
├── README.md                        # Main documentation
└── ONBOARDING.md                    # Onboarding guide (Hebrew)
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Docker & Docker Compose (for containerized deployment)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd duty_scheduler
   ```

2. **Configure environment**
   Create a `.env` file in the `server/` directory:
   ```env
   DATABASE_URL=postgres://user:password@localhost:5432/duty
   AUTH_SECRET=your-secret-key-here
   NODE_ENV=development
   ```
   Default DATABASE_URL: `postgres://duty:duty@localhost:5432/duty`

3. **Start the backend**
   ```bash
   cd server
   npm install
   npm run migrate
   npm start
   ```
   Server runs on http://localhost:4000

4. **Start the frontend** (in a new terminal)
   ```bash
   cd client
   npm install
   npm run dev
   ```
   Frontend runs on http://localhost:3000

### Docker Deployment

```bash
docker compose up --build
```

Access the application at:
- **Frontend**: http://localhost
- **Backend API**: http://localhost:4000/api

To run in background:
```bash
docker compose up -d --build
```

To stop:
```bash
docker compose down
```

## API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### People (`/api/people`) - Requires auth
- `GET /api/people` - List all people
- `POST /api/people` - Add a person
- `DELETE /api/people/:id` - Delete a person

### Posts (`/api/posts`) - Requires auth
- `GET /api/posts` - List all posts
- `POST /api/posts` - Add a post
- `DELETE /api/posts/:id` - Delete a post

### Constraints (`/api/constraints`) - Requires auth
- `GET /api/constraints` - List all constraints
- `POST /api/constraints` - Add a constraint
- `DELETE /api/constraints/:id` - Delete a constraint

### Schedule (`/api/schedule`) - Requires auth

#### Generation:
- `POST /api/schedule/generate` - Generate full schedule
- `POST /api/schedule/generate-guards` - Generate guards schedule only
- `POST /api/schedule/generate-kitchen` - Generate kitchen & escort schedule
- `POST /api/schedule/generate-rasar` - Generate Rasar & Escort 400 schedule

#### Save & Edit:
- `POST /api/schedule/save-all` - Save full schedule
- `POST /api/schedule/save-rasar` - Save Rasar & Escort 400 assignments
- `POST /api/schedule/update-cell` - Update single cell

#### Read:
- `GET /api/schedule/last` - Get last saved schedule
- `GET /api/schedule/history-periods` - List historical periods
- `GET /api/schedule/history?start=YYYY-MM-DD&end=YYYY-MM-DD` - Get historical schedule
- `GET /api/schedule/justice?mode=all|range&startISO=...&endISO=...` - Get justice table

#### Delete:
- `DELETE /api/schedule/clear?mode=all|guards|kitchen|rasar&start=...&end=...` - Clear schedule

### Health
- `GET /api/health` - Health check

## Database Schema

PostgreSQL tables (simplified):

### Core Tables

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

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

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  requiredPerShift INTEGER DEFAULT 1,
  optional BOOLEAN DEFAULT false,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE constraints (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  title TEXT NOT NULL,
  startISO TEXT NOT NULL,
  endISO TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

### Assignment Tables

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

CREATE TABLE bw_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  slotId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE kitchen_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE escort_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE rasar_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE escort400_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE es_assignments (
  id SERIAL PRIMARY KEY,
  groupId TEXT NOT NULL,
  personId INTEGER NOT NULL,
  userId INTEGER REFERENCES users(id)
);
```

### Settings Tables

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

### Archive Tables

All assignment tables have corresponding archive tables with `schedule_start` and `schedule_end` fields:
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

## Shift Schedules

### Guards (שמירות)
4-hour shifts:
- 00:00 - 04:00
- 04:00 - 08:00
- 08:00 - 12:00
- 12:00 - 16:00
- 16:00 - 20:00
- 20:00 - 00:00

### BW (ביטחון וסדר)
3 fixed shifts:
- Morning: 08:30 - 11:30 (3 hours)
- Afternoon: 13:30 - 17:30 (4 hours)
- Evening: 18:30 - 20:00 (1.5 hours)

### Kitchen (מטבח)
Dynamic shifts covering 06:00 - 21:00 (configurable)

### Escort (ליווי)
4 fixed shifts:
- Shift 1: 07:00 - 10:30
- Shift 2: 10:30 - 14:00
- Shift 3: 14:00 - 17:00
- Shift 4: 17:00 - 19:00

### Rasar (רס"ר)
3 fixed shifts:
- Rasar 1: 08:30 - 11:30
- Rasar 2: 13:30 - 17:30
- Rasar 3: 19:30 - 20:30

### Escort 400 (ליווי 400)
2 fixed shifts:
- Escort 400 1: 08:00 - 12:30
- Escort 400 2: 12:30 - 17:00

## Validation Rules

1. **Required staffing**: Each post/duty must have the required number of people per shift
2. **8-hour rest**: Minimum 2 shifts (8 hours) between assignments for each person
3. **Same-gender pairing**: People with `sameGenderPreference` can only be paired with same gender
4. **ES group limit**: Only 1 person from each ES group can be active per shift
5. **No double booking**: A person cannot be in multiple duties at the same time
6. **No overlaps**: All duty types are checked for time overlaps
7. **Exemption rules**: All exemption flags are respected (night guard, asthma, kitchen, etc.)
8. **Gender rules**: Escort 400 requires only females (F)
9. **Constraint respect**: Time constraints prevent assignment during constraint periods
10. **Asthma rule**: People with asthma exemption can only be assigned to "תצפיתן" post

## Color Coding

### Schedule Cells
- 🟢 **Green** - Fully staffed
- 🟠 **Orange** - Partially staffed
- 🔴 **Red** - Empty or invalid
- ⬜ **Gray** - No requirement (0 people needed)

### ES Group Columns
- 🔵 **Blue** - Normal state
- 🟢 **Green** - Fully assigned
- 🔴 **Red** - Missing people or violation

### Justice Table
Color-coded cells showing work hour distribution for fair visualization

## Excel Import Format

To import people, create an Excel file with these columns:

| name | gender | sameGenderPref | limitedAbility |
|------|--------|----------------|----------------|
| John | M | FALSE | FALSE |
| Jane | F | TRUE | FALSE |
| Alex | X | FALSE | TRUE |

Supported values:
- **gender**: M, F, X (or Hebrew: ז, נ)
- **sameGenderPref**: TRUE/FALSE, YES/NO, 1/0, כן/לא
- **limitedAbility**: TRUE/FALSE, YES/NO, 1/0, כן/לא

## Environment Variables

### Backend
- `DATABASE_URL` - PostgreSQL connection string (default: `postgres://duty:duty@localhost:5432/duty`)
- `AUTH_SECRET` - JWT secret key
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 4000)

### Frontend
- `VITE_BW_REQUIRED` - Required people per BW shift (default: 20)
- `VITE_STANDING_EXEMPT_POST_NAMES` - JSON array of post names exempt from standing (default: ["שג רגלי", "ימח", "שג רכוב אחורי", "שג רכוב קדמי", "עתודה"])

## Additional Documentation

- **[ONBOARDING.md](ONBOARDING.md)** - Comprehensive onboarding guide in Hebrew (עברית)
  - Introduction and concept
  - Features overview
  - Project structure
  - Architecture details
  - API endpoints
  - Database schema
  - Development workflow

## License

This project is licensed under the MIT License.

