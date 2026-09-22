# Studyspace — personal academic dashboard

A complete local app using **FastAPI, SQLAlchemy, SQLite, React, TypeScript, Tailwind CSS, and Vite**. Dark mode is the default. The app needs no account or cloud service.

Upgrading an existing installation? Follow [UPGRADE.md](UPGRADE.md) to preserve your coursework.

## Quick start

With Docker Desktop running, open a terminal in this directory:

```sh
docker compose up --build -d
```

Open **http://localhost:8080**. Add a course, add its tasks, then open a task to manage its checklist or focus on it. API documentation: **http://localhost:8080/api/docs**.

The first build downloads packages and container images. Subsequent app use is local. The optional Swagger documentation interface uses CDN assets; its schema at `/api/openapi.json` is local.

## 1. Project initialization

The complete source is already initialized. Extract the archive and open `academic-dashboard` in your editor; do not scaffold Vite over these files.

For development without Docker, use **Python 3.13** and **Node.js 22.12+**. From the project root, in PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-lock.txt
npm.cmd ci --prefix frontend
```

Start the backend in one terminal:

```powershell
Set-Location backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, from the project root:

```powershell
Set-Location frontend
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to FastAPI, so no extra CORS configuration is needed.

On macOS/Linux, use `python3`, replace `.venv/Scripts/python.exe` with `.venv/bin/python`, use `cd` instead of `Set-Location`, and use `npm` instead of `npm.cmd`.

Optional source control, from the project root:

```sh
git init
git add .
git commit -m "Build local academic dashboard"
```

### Complete project structure

```text
academic-dashboard/
├── README.md
├── UPGRADE.md
├── .env.example
├── .gitignore
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── requirements.txt             # Direct dependencies
│   ├── requirements-lock.txt        # Resolved runtime dependencies
│   ├── requirements-dev.txt
│   ├── schema.sql                   # Exported SQL schema
│   ├── app/
│   │   ├── __init__.py
│   │   ├── database.py              # Engine, foreign keys, sessions
│   │   ├── models.py                # SQLAlchemy entities
│   │   ├── schemas.py               # Validated API inputs/outputs
│   │   ├── main.py                  # Lifespan and coursework routes
│   │   ├── meetings.py              # Time-zone-aware recurrence and CRUD
│   │   ├── email_reports.py         # HTML tables and PNG report rendering
│   │   ├── music.py                 # Audio library, radio and YouTube search
│   │   ├── focus_sounds.py          # Uploaded focus alerts
│   │   ├── notifications.py         # SMTP configuration and daily scheduler
│   │   ├── todos.py                 # Independent daily planner API
│   │   ├── backgrounds.py           # Persistent media uploads
│   │   ├── migrations.py            # Preserves initial-schema data on upgrade
│   │   ├── init_db.py
│   │   └── seed_demo.py             # Optional sample coursework
│   └── tests/
│       └── test_api.py
└── frontend/
    ├── Dockerfile
    ├── .dockerignore
    ├── nginx.conf                   # Static app and API reverse proxy
    ├── package.json
    ├── package-lock.json
    ├── index.html
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx                  # Shell, navigation, data, dialogs
        ├── styles.css               # Tailwind and shared theme
        ├── types.ts
        ├── components/
        │   ├── MusicPlayer.tsx       # Persistent audio player and library
        │   ├── InterfaceStyle.tsx    # Palettes, surfaces and density
        │   ├── Appearance.tsx       # Backgrounds and motion settings
        │   ├── Forms.tsx            # Course/task forms and checklist editor
        │   ├── Modal.tsx
        │   ├── Pomodoro.tsx
        │   └── TaskCard.tsx
        ├── views/
        │   ├── MeetingsView.tsx
        │   ├── NotificationsView.tsx
        │   ├── TodoView.tsx
        │   ├── CoursesView.tsx
        │   ├── Dashboard.tsx
        │   ├── CourseView.tsx
        │   ├── CalendarView.tsx
        │   ├── KanbanView.tsx
        │   └── MatrixView.tsx
        └── lib/
            ├── planner.ts
            ├── planner.test.ts
            ├── api.ts
            ├── dates.ts
            ├── timer.ts
            ├── webmcp.ts
            └── productivity.test.ts
```

Database files, caches, `.venv`, `node_modules`, and compiled output are generated locally and excluded from the source archive.

## 2. Database schema

The executable definitions are in [models.py](backend/app/models.py), with connections in [database.py](backend/app/database.py). [schema.sql](backend/schema.sql) contains the generated SQL.

| Entity | Fields |
| --- | --- |
| Course | id, name, color, syllabus, created_at, updated_at |
| Task | id, course_id, title, description, task_type, due_at, status, priority, created_at, updated_at |
| Subtask | id, task_id, title, is_completed, position, created_at, updated_at |
| FocusSession | id, unique client_session_id, nullable task_id, started_at, ended_at, elapsed_seconds |
| Todo | id, title, scheduled_for, progress (0–100), nullable task_id, created_at, updated_at |
| BackgroundAsset | id, name, content_type, unique storage_name |
| MusicTrack | id, name, content_type, unique storage_name |
| Meeting | id, title, start_local, timezone, duration, frequency, interval, count, until, place, link, notes, color, timestamps |
| NotificationSettings | id, config JSON, encrypted secret |
| EmailDelivery | id, unique delivery_key, kind, status, detail, created_at |

```text
Course 1 ─── * Task 1 ─── * Subtask
                  1 ─── * FocusSession
```

- Colors use `#RRGGBB`; names and titles cannot be blank.
- Types: assignment, homework, quiz, project, exam.
- Statuses: not_started, in_progress, completed.
- Priorities: low, medium, high.
- Course deletion cascades to its tasks and checklists. Task deletion cascades to its checklist. The interface confirms course and task deletion.
- Focus history survives task deletion with a null task link. A unique client UUID prevents duplicate focus saves on retries.
- Daily reminders survive task deletion with a null source link. A task can be suggested into a given day only once. Personal items have no course requirement.
- Background metadata lives in SQLite; media files live in `DATA_DIR/backgrounds`.
- Each SQLite connection enables foreign keys. Startup enables WAL and creates missing tables.
- Inputs require timezone-aware dates. The custom UTCDateTime type stores UTC and returns aware values; the UI displays dates in the device timezone.
- Indexes support course, status, and due-date access. Checklist order uses position, then id.

Progress is calculated dynamically: completed tasks / total tasks at course level, and completed checklist items / total items at task level. Empty lists report 0%. Completing a checklist does not automatically change task status.

The database defaults to `backend/data/academic.db`. `DATA_DIR` overrides its directory; Docker uses `/data`. API startup initializes it automatically. For manual initialization, run `python -m app.init_db` from `backend` using the virtual environment.

Startup includes a transactional upgrade from the initial Step 2 schema to non-reused record IDs, preserving existing coursework. Beyond that specific upgrade, `create_all` does not migrate existing tables. Use Alembic when making further schema changes to a populated installation.

## 3. Backend API

[main.py](backend/app/main.py) implements the routes. [schemas.py](backend/app/schemas.py) validates payloads. Each request gets its own SQLAlchemy session.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | /api/health | Database health check |
| GET / POST | /api/music | List uploaded audio or upload raw audio bytes |
| GET | /api/music/{id}/file | Stream audio with byte-range support |
| DELETE | /api/music/{id} | Remove an uploaded track |
| GET | /api/music/radio/search | Search public stations by q and genre |
| GET / POST | /api/meetings | List or create meeting series |
| PUT / DELETE | /api/meetings/{id} | Replace or delete a series |
| GET | /api/meetings/occurrences | Expand timezone-aware start/end range (maximum 370 days) |
| GET / PUT | /api/notifications | Read or save SMTP and schedule settings |
| GET | /api/notifications/preview | Preview daily or unfinished report |
| GET | /api/notifications/history | Latest 20 delivery attempts |
| POST | /api/notifications/test | Send one test email using saved settings |
| GET / POST | /api/courses | List or create courses |
| GET / PATCH / DELETE | /api/courses/{id} | Read, edit, delete course |
| GET / POST | /api/tasks | List or create tasks |
| GET / PATCH / DELETE | /api/tasks/{id} | Read, edit, delete task |
| POST | /api/tasks/{id}/subtasks | Add checklist item |
| PATCH / DELETE | /api/subtasks/{id} | Edit/check/reorder or delete item |
| GET / POST | /api/focus-sessions | Read or save work intervals |
| GET / POST | /api/todos | List a day or add a personal/linked reminder |
| PATCH / DELETE | /api/todos/{id} | Edit title/date/progress or delete |
| GET / POST | /api/backgrounds | List media or upload raw binary with Content-Type and X-File-Name headers |
| GET | /api/backgrounds/{id}/file | Serve uploaded media |
| DELETE | /api/backgrounds/{id} | Delete media and metadata |

Task responses include checklists, checklist progress, and total focus seconds. Course responses include completion counts and percentages. Read a checklist through its task response.

`GET /api/tasks` accepts optional `course_id` and `status` filters. Focus-session listing accepts `task_id`.

Example course POST:

```json
{"name":"Computer Architecture","color":"#A99BFF","syllabus":"Instruction sets, pipelines, memory hierarchies."}
```

Example task POST, using the returned course ID:

```json
{
  "course_id": 1,
  "title": "Pipeline simulation report",
  "description": "Include timing diagrams and compare forwarding strategies.",
  "task_type": "assignment",
  "due_at": "2026-09-18T23:59:00+04:00",
  "status": "not_started",
  "priority": "high"
}
```

PATCH the task with `{"status":"in_progress"}` to move it to Doing. Creates return 201; reads/updates return 200; deletes return 204. Invalid input returns 422, missing records 404, and conflicts 409. PATCH allows omitted fields but rejects explicit nulls.

Retrying the same focus interval returns its original record. Reusing its identifier with different interval data returns 409.

## 4. Frontend views

- **Meetings:** recurring series with time zones, locations, links, agenda notes, end dates/counts and calendar integration.
- **Music:** searchable uploads, favorites, online radio discovery and persistent playback across views.
- **Email reminders:** SMTP setup, two daily schedules, readable HTML tables, PNG attachments, previews and delivery history; today/yesterday unfinished to-dos and one-hour meeting reminders, disabled until configured. See [UPGRADE.md](UPGRADE.md) for setup and scheduling behavior.
- **Interface themes:** five palettes, three panel styles, device/dark/light modes, spacing and text controls.
- **To-do list:** independent daily plans, today/future date selection, item progress, editing/moving, and one-click reminders from coursework due in less than a week. See [UPGRADE.md](UPGRADE.md) for date and suggestion rules.
- **Courses:** dedicated gallery with syllabus previews, progress and next deadlines; add courses directly here.
- **Appearance:** four backgrounds, persistent image/GIF/video uploads, dimming, mouse movement and click animations, and reduced-motion support.
- **Dashboard:** Due Today, Next 7 Days, overdue alerts, and total completion. Next 7 Days means tomorrow through the seventh following calendar day. An earlier-today deadline appears in both Due Today and Overdue until completed.
- **Course:** syllabus, progress, status filters, task creation/editing/deletion, and editable project checklists.
- **Kanban:** To do / Doing / Done. Drag a grip with the mouse or briefly hold it on a touchscreen. A status menu provides a keyboard alternative. Changes persist through the API.
- **Calendar:** month/week grids, previous/next/Today controls, course filtering, completed-task visibility. Select a day or “more” to inspect its week. Narrow screens scroll within the calendar and board regions.
- **Eisenhower matrix:** urgent = due within 48 hours (including overdue); important = high priority. The four quadrants update from task dates and priorities; completed tasks are excluded. Adjust the rule in [dates.ts](frontend/src/lib/dates.ts).
- **Pomodoro:** 25-minute work and 5-minute breaks, linked or unlinked work, pause/resume, and early finish. Breaks start manually and do not count as work. Available in the dashboard rail and a floating panel on other views.
- **Shell:** collapsible desktop sidebar, mobile drawer, persistent dark/light preference, hash-based navigation, keyboard focus styles, and native dialogs.

### Timer implementation

[Pomodoro.tsx](frontend/src/components/Pomodoro.tsx) is the UI; [timer.ts](frontend/src/lib/timer.ts) holds timing logic.

An absolute running timestamp prevents background throttling from slowing the countdown. Paused time is excluded. Refresh restores the interval; a late wake-up records at most 25 minutes and leaves the next interval stopped. Closing the browser does not implicitly pause a running interval.

Saved work goes to SQLite. Failed saves stay in a browser-local queue and retry when connectivity returns. Keep that browser's storage until pending saves finish. Sub-second work is not logged. Task selection is locked during active/paused intervals to avoid reassigning time halfway through.

“Focused today” groups sessions by their end date in the device timezone. Timer state and theme are browser-local and origin-specific; another device has its own timer.

Optional WebMCP integration registers `list_coursework` and `open_task_details` when supported by the browser. Normal functionality does not depend on it. A supported WebMCP browser was not available for contract verification.

## 5. Dockerization

[docker-compose.yml](docker-compose.yml) starts a non-root Python backend and an Nginx frontend built in a separate Node stage. Nginx proxies `/api` to the internal backend. Only the frontend port is published. Health checks gate startup; SQLite is stored in a named volume.

```sh
docker compose up --build -d
docker compose ps
docker compose logs -f
```

Stop while retaining coursework:

```sh
docker compose down
```

The `academic-data` volume survives restarts and rebuilds. `docker compose down -v` deletes it and its coursework.

### Tablet / local-network access

Copy `.env.example` to `.env` and set:

```dotenv
HOST_BIND=0.0.0.0
APP_PORT=8080
```

Run `docker compose up -d` again. Open `http://YOUR-COMPUTER-LAN-IP:8080` on the tablet; allow the port in your local firewall if needed. This is a single-user app without sign-in, so enable LAN access only on a trusted network.

### Database backup

Use SQLite's backup API to include committed WAL data:

```sh
docker compose exec backend python -c "import sqlite3; s=sqlite3.connect('/data/academic.db'); d=sqlite3.connect('/data/academic-backup.db'); s.backup(d); d.close(); s.close()"
docker compose cp backend:/data/academic-backup.db ./academic-backup.db
```

For restoration, stop the backend, preserve the current database, replace it with the backup, remove stale WAL/SHM sidecars for that stopped database, ensure the container user owns the files, and restart. Do not replace a database while the API is running.

### Optional example data

For an empty workspace only:

```sh
docker compose exec backend python -m app.seed_demo
```

Or run `.venv/Scripts/python.exe -m app.seed_demo` from the local backend directory. This creates three example courses and seven tasks with relative deadlines. It refuses to run if any course already exists. Examples can be edited or deleted in the app.

## Verification

Backend, from `backend`:

```powershell
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
.venv/Scripts/python.exe -m pytest -q
```

Frontend, from `frontend`:

```sh
npm test
npm run build
```

Tests also cover daily-plan date validation, reminder independence, progress bounds, uploads and media cleanup. Tests cover CRUD, checklist progress, timezone conversion, filtering, invalid inputs, foreign keys, cascades, retained focus history, duplicate focus saves, date boundaries, matrix rules, paused time, and late timer wake-ups.

Verified in the development environment: **30 backend tests and 18 frontend tests passed**, the production frontend bundle built, and the frontend/proxied API returned HTTP 200. Compose configuration validation passed. Container build/run could not be verified because this environment denies access to Docker's named pipe. Browser checks verified daily-plan creation, completion and partial progress, future-date persistence after reload, reminder addition, the Courses gallery, and background preset selection. Version 3 also verifies meeting CRUD, recurrence through daylight-saving changes and month ends, encrypted credentials, report content, duplicate prevention, skipped completed work and SMTP failure handling. Browser checks verified meeting creation/calendar editing, palette selection and report preview. Version 4 adds tests for today-only filtering across timezone boundaries, HTML escaping, MIME alternatives and PNG attachments, image pagination, audio validation/range requests/deletion, and radio URL filtering. SMTP transport is tested with mocks; no real email was sent. Version 4 browser playback verification was interrupted; audible playback and live station availability were not verified. The existing Docker installation was not changed by these checks; preview data was isolated.

If a restricted Windows environment blocks Vite's native config bundler from traversing parent directories, use:

```sh
npm run build -- --configLoader runner
npm test -- --configLoader runner
npm run preview -- --configLoader runner
```

Preview serves the built bundle at **http://127.0.0.1:4173**, with the same API proxy; keep FastAPI running. Docker uses the standard build command.

## References

- [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/)
- [SQLAlchemy SQLite foreign keys](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#foreign-key-support)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Vite guide](https://vite.dev/guide/)


## Version 5 upgrades

Meeting reminder emails, today/yesterday unfinished reports, selectable/uploaded focus alerts, expanded radio genres, official YouTube search/player, and custom accent/surface colors are included. Follow [UPGRADE.md](UPGRADE.md) for setup, API-key configuration and playback limitations. Existing Docker data is preserved.
