# Its-Time-To-DSA — Server 🖥️

The Express.js + MongoDB backend powering the **Its-Time-To-DSA** platform. It handles Google OAuth authentication, dynamic schedule generation, LeetCode progress verification, and statistics.

---

## ✨ Features

- **🔐 Google OAuth 2.0** — Passport.js strategy with JWT-signed session cookies
- **🗓️ Dynamic Schedule Engine** — Phase-based, difficulty-interleaved roadmap generator that scales to 60/90/120 days and respects user daily intensity goals (light/medium/intense)
- **📈 LeetCode Sync** — Verifies solved problems against your LeetCode GraphQL API submissions
- **📊 Stats API** — Heatmap data, topic breakdown, difficulty distribution, streak tracking
- **🛠️ Problem Reporting System** — Automated triaging of broken links with a replacement engine for roadmap integrity
- **⏸️ Schedule Control** — Admins can apply global platform schedule pauses. Users can opt-in/opt-out of Sunday Rest Days and request per-user schedule pauses, dynamically pushing dates linearly.
- **🛡️ Security** — Helmet, CORS with credentials, express-rate-limit, input validation via express-validator
- **🌱 Database Seeder** — Seeds the `problems` collection from real DSA CSV sheets (Arsh Goyal 45-60 Days, Shradha Ma'am 2.5 Months)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Framework | Express.js 4 |
| Database | MongoDB via Mongoose 8 |
| Auth | Passport.js (Google OAuth 2.0) + JWT cookies |
| Validation | express-validator |
| Rate Limiting | express-rate-limit |
| Security Headers | Helmet |
| CSV Parsing | fast-csv |
| HTTP Client | Axios (for LeetCode GraphQL) |
| Dev Server | Nodemon |

---

## 📁 Project Structure

```
Its-Time-To-DSA_Server/
├── scripts/
│   ├── seed.js                          # Seeds MongoDB from CSV files
│   ├── DSA Sheet by Arsh (...).csv      # Arsh Goyal problem list
│   └── DSA by Shradha Ma'am (...).csv   # Shradha Ma'am problem list
├── src/
│   ├── config/
│   │   └── db.js                # Mongoose connection
│   ├── controllers/
│   │   ├── adminController.js      # Platform-wide metrics, user auditing
│   │   ├── onboardingController.js  # Complete onboarding, validate LeetCode
│   │   ├── problemController.js     # CRUD for DSA problems + health checks
│   │   ├── progressController.js   # Log solves, bookmark, notes
│   │   ├── scheduleController.js   # Today, overview, full schedule endpoints
│   │   ├── statsController.js      # Heatmap, topic & difficulty breakdown
│   │   ├── userController.js       # Profile get/update, reschedule
│   │   └── verifyController.js     # LeetCode GraphQL submission sync
│   ├── middleware/
│   │   └── errorHandler.js         # Centralized error handler + createError
│   │   ├── Problem.js              # DSA problem schema
│   │   ├── Progress.js             # Daily solve tracking per user
│   │   ├── Schedule.js             # Generated roadmap (days[] with problems[])
│   │   ├── User.js                 # User profile + onboarding fields
│   │   ├── PlatformConfig.js       # Global config (e.g., Global Pause state)
│   │   └── PauseRequest.js         # User pause requests
│   ├── routes/
│   │   ├── admin.js                 # /api/admin/* (Stats, user lists, triage)
│   │   ├── auth.js                 # /api/auth/* (Google OAuth, me, logout)
│   │   ├── onboarding.js           # /api/onboarding/*
│   │   ├── problem.js              # /api/problem/* (Reporting, replacement)
│   │   ├── progress.js             # /api/progress/*
│   │   ├── schedule.js             # /api/schedule/*
│   │   ├── stats.js                # /api/stats
│   │   ├── user.js                 # /api/user/*
│   │   └── verify.js               # /api/verify
│   ├── services/
│   │   └── scheduleEngine.js       # Core dynamic roadmap generator
│   └── app.js                      # Express app config, middleware, routes
├── server.js                        # Entry point (starts HTTP server)
├── .env.example                     # Environment variable template
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB Atlas cluster (or local MongoDB)
- Google OAuth 2.0 credentials

### Installation

```bash
cd Its-Time-To-DSA_Server
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
NODE_ENV=development
PORT=3001

# MongoDB
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/its-time-to-dsa

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# JWT
JWT_SECRET=your_jwt_secret_min_32_chars

# CORS
CLIENT_URL=http://localhost:5173
```

### Seed the Database

Import all DSA problems from the CSV sheets:

```bash
npm run seed
```

This reads the two CSV files and upserts problems into the `problems` collection.

### Backfill LeetCode Submission Links

If you already have solved progress records but missing `submissionUrl` values, run the backfill script:

```bash
npm run backfill:submissions
```

The script reads each user's accepted LeetCode submissions through GraphQL, matches them to progress entries by `leetcodeSlug`, and stores the submission link in MongoDB.

### Run Development Server

```bash
npm run dev
```

Server starts at **http://localhost:3001**

---

## 📡 API Reference

### Auth — `/api/auth`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/google` | Redirect to Google OAuth consent screen |
| `GET` | `/google/callback` | OAuth callback, sets JWT cookie |
| `GET` | `/me` | Returns current authenticated user |
| `POST` | `/logout` | Clears JWT cookie |

### Admin — `/api/admin` (Admin Role)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stats` | Platform-wide metrics (Daily active, total solves) |
| `GET` | `/users` | Paginated list of all registered users |
| `GET` | `/users/:id` | Detailed user profile + activity history |
| `GET` | `/reports` | Aggregated reports of broken problems |

### Problems — `/api/problem`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/report` | Flag a problem as broken or invalid |
| `GET` | `/:id` | Get problem metadata |
| `PATCH` | `/:id` | Update problem metadata (Admin) |

### Onboarding — `/api/onboarding`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/complete` | Saves user prefs + triggers schedule generation |
| `GET` | `/validate-lc/:username` | Validates LeetCode username via GraphQL |

### Schedule — `/api/schedule`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/today` | Today's problems, enriched with progress |
| `GET` | `/day/:dayNumber` | Get a specific day by roadmap day number |
| `GET` | `/overview` | Compact overview of all days (for calendar) |
| `GET` | `/full` | Full populated schedule (problems with names) |

### Progress — `/api/progress`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/solve` | Mark a problem as solved |
| `POST` | `/bookmark` | Toggle bookmark on a problem |
| `POST` | `/note` | Save a note for a problem |
| `GET` | `/history` | Get full solve history |

### Stats — `/api/stats`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Heatmap data, topic breakdown, difficulty stats, streaks |

### User — `/api/user`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/profile` | Get user profile |
| `POST` | `/update` | Update profile + optionally trigger reschedule |

### Verify — `/api/verify`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/` | Sync solved problems from LeetCode submissions |

---

## 🧠 Schedule Engine (`scheduleEngine.js`)

The core of the platform. Generates a fully personalized DSA roadmap:

### Phase Blueprints (% of total days)
| Phase | Topics | % |
|---|---|---|
| 0 — Basics | Arrays, Strings, Basic Math | 15% |
| 1 — Patterns | Hashing, Two Pointers, Sliding Window | 20% |
| 2 — Logic | Recursion, Backtracking, Binary Search | 20% |
| 3 — Data Structures | Graphs, Trees, Heaps | 25% |
| 4 — Advanced | Dynamic Programming, Advanced Graphs | 20% |

### Daily Mix (by intensity)
- **Light**: 2–3 problems/day (mostly Easy/Medium, Hard every 4 days)
- **Medium**: 3–5 problems/day (balanced, Hard every 3 days)
- **Intense**: 5–8 problems/day (Hard every 2 days)

### Saturday Special
Every Saturday generates a **Revision + Boss Fight** day:
- Revisits spaced-repetition problems from history
- Adds 1 brand-new Hard/Medium "challenge" problem (🏆)

---

## 🗃️ Data Models

### `User`
```js
{
  googleId, name, email, avatar,
  leetcodeUsername, startDate,
  dailyGoal: 'light' | 'medium' | 'intense',
  totalDays: Number,           // 60 / 90 / 120
  sundayRestEnabled: Boolean,  // true / false
  usernameChangeCount,
  onboardingComplete,
  isPaused: Boolean, pauseReason: String, pausedAt: Date,
  currentStreak, longestStreak, totalSolved
}
```

### `Schedule`
```js
{
  userId, generatedAt, totalDays, dailyGoal,
  days: [{
    dayNumber, date, type: 'learn' | 'revision' | 'mixed',
    isCompleted,
    readings: [{ title, type }],
    problems: [{
      problemId, difficulty, topic,
      isRevision, isChallenge, status
    }]
  }]
}
```

### `Progress`
```js
{
  userId, date,
  completed: [{ problemId, solvedAt }],
  bookmarks: [problemId],
  notes: [{ problemId, text }]
}
```

### `Problem`
```js
{
  name, difficulty, topic,
  leetcodeSlug, gfgUrl, slug,
  source: 'arsh' | 'shradha' | 'custom'
}
```

---

## ⚠️ Notes

- The CSV files in `scripts/` are the source of truth for the problem database. Run `npm run seed` when setting up a fresh environment.
- Schedule generation is **async fire-and-forget** after onboarding — the client polls `/schedule/today` with a retry mechanism while the schedule is being built.
- All dates throughout the system are stored as **UTC midnight** (`Date.UTC(...)`) to prevent timezone drift, especially for IST users.
