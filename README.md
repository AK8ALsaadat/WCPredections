# PredictLeague — Football Prediction Platform

A full-stack fantasy-style football prediction web application built with Next.js, Prisma, and Supabase PostgreSQL.

## Features

- **Custom authentication** — username + password with bcrypt hashing (no Supabase Auth)
- **Match predictions** — score, double boost (2 per round), knockout finish type, penalty winner
- **Goal scorer predictions** — multiple scorers per match (+1 each)
- **Automatic scoring** — points calculated when matches finish
- **Leaderboards** — overall and per-round rankings
- **Admin dashboard** — sync matches from external APIs, manage data, update results
- **Dark mode UI** — responsive, mobile-friendly design

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes + Service Layer |
| Database | Supabase PostgreSQL |
| ORM | Prisma |
| Auth | iron-session + bcryptjs |

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project (PostgreSQL database)
- (Optional) API-Football or Football-Data.org API key

## Setup

### 1. Install dependencies

```bash
cd football-predictions
npm install
```

### 2. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

#### Required variables

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `DATABASE_URL` | Supabase pooled connection string | Supabase → Settings → Database → Connection string (Transaction pooler, port 6543) |
| `DIRECT_URL` | Supabase direct connection string | Supabase → Settings → Database → Connection string (Direct, port 5432) |
| `SESSION_SECRET` | Random 32+ character secret for session encryption | Generate: `openssl rand -base64 32` |

#### Optional variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ADMIN_USERNAMES` | Comma-separated usernames that get admin access (e.g. `admin,yourname`) |
| `FOOTBALL_API_PROVIDER` | `api-football` or `football-data` |
| `API_FOOTBALL_KEY` | API-Football API key |
| `FOOTBALL_DATA_API_KEY` | Football-Data.org API key |

> **Security note:** Never commit `.env` to version control. The keys you shared should be stored only in `.env`.

### 3. Run database migrations

```bash
npm run db:migrate
```

Or push schema directly (for initial setup):

```bash
npm run db:push
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## First-time Usage

1. **Register** an account at `/register`
2. If your username is in `ADMIN_USERNAMES`, you'll have admin access
3. As admin, go to `/admin` to:
   - Create a **round** (gameweek)
   - Create **teams** and **players** (or sync from API)
   - **Sync matches** from API-Football / Football-Data.org
4. Users can then predict on `/matches` before kickoff

## Scoring Rules

### Match Score
| Result | Points |
|--------|--------|
| Exact score correct | +3 |
| Winner/draw correct (wrong score) | +1 |
| Wrong | 0 |

**Double boost:** Multiplies score prediction points (exact: 6, winner: 2). Max 2 doubles per round.

### Goal Scorers
- +1 per correctly predicted scorer

### Knockout Matches
- Correct finish type (90 min / extra time / penalties): +1
- Correct penalty shootout winner counts as the normal winner/result point, not an extra point

## API Routes

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user

### Matches & Predictions
- `GET /api/matches` — List matches (`?upcoming=true&roundId=`)
- `GET /api/matches/[id]` — Match details
- `POST /api/predictions` — Submit score prediction
- `POST /api/scorer-predictions` — Submit scorer predictions

### Leaderboards
- `GET /api/leaderboard/overall` — Overall rankings
- `GET /api/leaderboard/round/[roundId]` — Round rankings

### Admin (requires admin user)
- `POST /api/admin/sync` — Sync from football API
- `PATCH /api/admin/matches/[id]` — Update match result
- `POST /api/admin/calculate-points` — Recalculate points
- `POST /api/admin/rounds` — Create round
- `POST /api/admin/teams` — Create team
- `POST /api/admin/players` — Create player

## External API Integration

The sync service supports two providers via `FOOTBALL_API_PROVIDER`:

### API-Football
```env
FOOTBALL_API_PROVIDER=api-football
API_FOOTBALL_KEY=your-key
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
```

Sync payload example:
```json
{
  "roundId": "clx...",
  "leagueId": "39",
  "season": "2025"
}
```

### Football-Data.org
```env
FOOTBALL_API_PROVIDER=football-data
FOOTBALL_DATA_API_KEY=your-key
FOOTBALL_DATA_BASE_URL=https://api.football-data.org/v4
```

## Project Structure

```
src/
├── app/
│   ├── (main)/          # Protected pages with navbar
│   │   ├── dashboard/
│   │   ├── matches/
│   │   ├── predict/
│   │   ├── leaderboard/
│   │   ├── profile/
│   │   └── admin/
│   ├── api/             # API routes
│   ├── login/
│   └── register/
├── components/          # UI components
├── lib/                 # Auth, prisma, utils, validations
├── services/            # Business logic
│   └── football-api/    # External API providers
└── types/               # TypeScript types
prisma/
├── schema.prisma
└── migrations/
```

## Deployment

### Vercel (recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add all environment variables from `.env.example`
4. Set build command: `npm run build`
5. Deploy

### Database

Use Supabase connection pooler URL for `DATABASE_URL` in production (serverless).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Prisma Studio |

## License

Private — all rights reserved.
