# Picks Against the Spread

A weekly NFL picks pool: players enter picks against the spread, the board
scores itself live as games play out, and the commissioner runs the week from an
admin screen instead of a mailbox full of texts.

Three faces:

| Who | Where | What they get |
| --- | --- | --- |
| Anyone | `/` and `/board` | Standings and every pick, no sign-in. Players appear as initials only. |
| Players | `/picks` | Sign in by email link, make and change picks until each game kicks off. |
| Commissioner | `/admin` | Build the week, set the lines, key in picks that arrive by text, see everything. |

## How the pool works

- **One point per correct pick** against the spread. A push (the game lands
  exactly on the number) is worth nothing to anybody and costs nothing.
- **Tiebreaker**: closest guess to the combined points in the nominated game —
  normally Monday night.
- **Picks lock per game, at that game's own kickoff.** The Thursday nighter
  closes Thursday while the Sunday slate stays open. A pick stays hidden from
  the public board until its game locks.

## Setup

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and AUTH_SECRET
npm run db:push                # create the tables
npm run db:seed -- --email you@example.com --initials BJM
npm run dev
```

Sign in at `/login` with that email. Without `RESEND_API_KEY` set, the sign-in
link is printed to the server console instead of emailed — which is all you need
locally.

### Environment

| Variable | Needed | What it does |
| --- | --- | --- |
| `DATABASE_URL` | yes | Any Postgres — see [Where to host the database](#where-to-host-the-database). Use the **pooled** connection string. |
| `AUTH_SECRET` | yes | Signs sessions. `openssl rand -base64 32`. |
| `APP_URL` | yes | Public base URL, used to build sign-in links. |
| `ODDS_API_KEY` | no | [The Odds API](https://the-odds-api.com) key for spreads. Without it, type the lines in by hand. |
| `ODDS_BOOKMAKER` | no | Which book to take the line from. Defaults to `draftkings`. |
| `CRON_SECRET` | yes | Shared secret protecting the score-polling endpoint. |
| `RESEND_API_KEY` | no | Sends sign-in emails. Unset = links go to the console. |

## Where to host the database

**Use [Neon](https://neon.tech).** Free tier, Postgres, and it is what Vercel's
own Postgres offering runs on — so you get the same thing without the extra
billing layer. A pool this size will not come close to the free limits: the
whole season is a few thousand rows.

Set it up:

1. Create a Neon project, pick the region closest to your Vercel region.
2. Copy the **pooled** connection string — the hostname contains `-pooler`.
   The app sets `prepare: false` because pooled Postgres runs PgBouncer in
   transaction mode, which rejects prepared statements.
3. Put it in `DATABASE_URL`, locally and in Vercel.
4. Run `npm run db:push` once against it.

Worth knowing: Neon's free tier suspends compute after a few minutes idle, so
the first request after a quiet spell takes an extra second or so. For a pool
that gets busy on Sundays that is a non-issue, and the score cron keeps it warm
during games anyway.

Alternatives, if you would rather not add Neon:

- **Supabase** — also free Postgres. Use the pooled string on port `6543`. Sensible
  if you later want its auth or storage; otherwise it is more product than you need.
- **Vercel Postgres** — Neon underneath, provisioned from the Vercel dashboard and
  billed through Vercel. Slightly simpler setup, less generous free tier.
- **A container on your own box** — fine, but then you are the one keeping it up on
  a Sunday afternoon, and it needs to be reachable from Vercel.

For local development, point `DATABASE_URL` at a second free Neon database (a
separate project, or just a second database in the same one) rather than
installing Postgres.

## Running a week

1. **Admin → Add week.** The NFL schedule for that week comes straight from
   ESPN, with real kickoff times — which is what drives per-game locking.
2. **Sync spreads.** Pulls the current line for every game.
   *Any line you type in yourself wins permanently* — the sync skips games you
   have touched, so the book can never overwrite the number your pool agreed on.
   Clear the box to hand that game back to the sync.
3. **Bye weeks: add college games.** When the NFL card comes up short, search a
   Saturday and cherry-pick the late kickoffs you want. Roughly 60 FBS games are
   played on a Saturday, so it searches and filters to 7pm ET and later rather
   than importing the lot. College games score exactly like NFL ones.
4. **Set the tiebreaker game** — usually Monday night, but it can be any game on
   the card, including a college one.
5. **Publish.** The week appears for players and on the public board.
6. Picks that still arrive by text go in through **Everyone's picks**; click a
   cell to cycle away → home → blank. Those are flagged with a dot so you can
   tell later what came from you.

## Live scoring

`/api/cron/scores` pulls scores from ESPN for every unfinished game in a
published week. `vercel.json` schedules it every minute; any scheduler works:

```bash
curl "https://your-app/api/cron/scores?secret=$CRON_SECRET"
```

The standings separate **banked wins** from **Proj.**, which adds picks that are
currently covering in games still being played. Sorting is on banked wins first,
so a leader is never displaced by a game that has not finished.

## Deploying

Push to GitHub, import into Vercel, set the environment variables above, and
point `DATABASE_URL` at a hosted Postgres. `vercel.json` sets up the cron.
Run `npm run db:push` once against the production database.

## Development

```bash
npm run dev         # http://localhost:3000
npm test            # scoring engine unit tests
npm run typecheck
npm run lint
npm run db:studio   # browse the database
```

The scoring rules live in [`src/lib/scoring.ts`](src/lib/scoring.ts) and are
covered by tests — pushes, live-vs-final states, missing picks and tiebreaker
ordering. Change the rules there and the tests will tell you what you broke.

## Planned (phase two)

Nudges to players who have not picked yet, by email and SMS. The groundwork is
in: `sendMail()` in [`src/lib/mail.ts`](src/lib/mail.ts) is the single outbound
path, players already carry a mobile number, and the admin week view already
knows exactly who is missing how many picks.
