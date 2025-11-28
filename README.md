# Duty Scheduler (סידור תורנויות)

A web application for scheduling people across duty shifts with support for multiple posts, rest rules, and special duty groups (כ"כ).

![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Node.js](https://img.shields.io/badge/Node.js-18-green)
![SQLite](https://img.shields.io/badge/SQLite-3-lightgrey)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

## Features

### People Management
- Add/delete people with name, gender (M/F/X), and same-gender preference
- Import people from Excel (.xlsx) files
- Same-gender preference ensures pairing only with same gender

### Posts Management
- Create multiple posts/stations that need staffing
- Configure required people per shift for each post
- Override requirements for specific shifts

### Schedule Generation
- Automatic schedule generation with constraints:
  - **8-hour rest rule**: Minimum 8 hours between shifts (2 shift gap)
  - **Equal distribution**: Spreads shifts evenly among all people
  - **Same-gender pairing**: Respects gender preferences when pairing
  - **Exemptions**: Support for post/date exemptions
- Manual editing of individual cells
- Visual validation with color-coded cells

### ES Groups (כ"כ - קצין כוננות)
- Two special duty groups that span the entire schedule period
- Configurable total people per group (default: 5 and 4)
- Rule: Only 1 person from each group can be active per shift
- Members can also be assigned to regular shifts (with validation)

### Export & Import
- Export schedule to styled Excel (.xlsx) with:
  - Color-coded cells (green=full, orange=partial, red=empty)
  - Merged cells for ES groups
  - Bold headers and borders
- Import people from Excel with columns: `name`, `gender`, `sameGenderPref`

### Internationalization
- Full support for English and Hebrew (עברית)
- RTL layout for Hebrew
- Language toggle in the app bar

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Material-UI (MUI)** for components and styling
- **Vite** for build tooling
- **xlsx-js-style** for Excel export with styling
- **dayjs** for date manipulation

### Backend
- **Node.js** with Express
- **SQLite3** for database
- **ES Modules** syntax

### Infrastructure
- **Docker** & Docker Compose for containerization
- **Nginx** for serving frontend in production

## Project Structure

```
duty_scheduler/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── schedule/       # Schedule-related components
│   │   │   │   ├── CellEditDialog.tsx
│   │   │   │   ├── ESEditDialog.tsx
│   │   │   │   ├── ShiftSettingsDialog.tsx
│   │   │   │   ├── excelExport.ts
│   │   │   │   ├── utils.ts
│   │   │   │   └── index.ts
│   │   │   ├── PeopleEditor.tsx
│   │   │   ├── PostsEditor.tsx
│   │   │   └── ScheduleView.tsx
│   │   ├── util/
│   │   │   └── i18n.tsx        # Internationalization
│   │   ├── api.ts              # API client
│   │   ├── types.ts            # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── server/                     # Node.js backend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── people.js
│   │   │   ├── posts.js
│   │   │   └── schedule.js
│   │   ├── scheduler.js        # Schedule generation algorithm
│   │   ├── migrate.js          # Database migration
│   │   └── index.js            # Express server
│   ├── migrations/
│   │   └── init.sql            # Database schema
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
├── .gitignore
└── README.md
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

2. **Start the backend**
   ```bash
   cd server
   npm install
   npm run migrate
   npm start
   ```
   Server runs on http://localhost:4000

3. **Start the frontend** (in a new terminal)
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

### People
- `GET /api/people` - List all people
- `POST /api/people` - Add a person
- `DELETE /api/people/:id` - Delete a person

### Posts
- `GET /api/posts` - List all posts
- `POST /api/posts` - Add a post
- `DELETE /api/posts/:id` - Delete a post

### Schedule
- `POST /api/schedule/generate` - Generate a new schedule
- `POST /api/schedule/save-all` - Save the entire schedule
- `GET /api/schedule/last` - Get the last saved schedule

## Database Schema

```sql
-- People table
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  sameGenderPref INTEGER DEFAULT 0,
  exemptions TEXT DEFAULT '[]'
);

-- Posts table
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  requiredPerShift INTEGER DEFAULT 1,
  optional INTEGER DEFAULT 0
);

-- Assignments table
CREATE TABLE assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personId INTEGER NOT NULL,
  postId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftLabel TEXT NOT NULL,
  startISO TEXT,
  endISO TEXT
);
```

## Shift Schedule

The system uses 4-hour shifts:
- 00:00 - 04:00
- 04:00 - 08:00
- 08:00 - 12:00
- 12:00 - 16:00
- 16:00 - 20:00
- 20:00 - 00:00

## Validation Rules

1. **Required staffing**: Each post must have the required number of people per shift
2. **8-hour rest**: Minimum 2 shifts (8 hours) between assignments for each person
3. **Same-gender pairing**: People with `sameGenderPreference` can only be paired with same gender
4. **ES group limit**: Only 1 person from each ES group can be active per shift
5. **No double booking**: A person cannot be in multiple posts at the same shift

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

## Excel Import Format

To import people, create an Excel file with these columns:

| name | gender | sameGenderPref |
|------|--------|----------------|
| John | M | FALSE |
| Jane | F | TRUE |
| Alex | X | FALSE |

Supported values:
- **gender**: M, F, X (or Hebrew: ז, נ)
- **sameGenderPref**: TRUE/FALSE, YES/NO, 1/0, כן/לא

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

