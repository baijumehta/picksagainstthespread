import {
  pgTable, uuid, text, integer, boolean, timestamp, numeric,
  serial, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/** A person in the pool. Publicly they are only ever their initials. */
export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Public identity. Everything on the public board keys off this. */
    initials: text("initials").notNull(),
    /** Admin-only. Never rendered on the public side. */
    fullName: text("full_name"),
    email: text("email").notNull(),
    /** Phase two: SMS nudges for missing picks. */
    phone: text("phone"),
    isAdmin: boolean("is_admin").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("players_initials_key").on(t.initials),
    uniqueIndex("players_email_key").on(t.email),
  ],
);

export const seasons = pgTable(
  "seasons",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
  },
  (t) => [uniqueIndex("seasons_year_key").on(t.year)],
);

export const weeks = pgTable(
  "weeks",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    label: text("label").notNull(),
    /**
     * The game whose combined score settles ties. Normally Monday night, but
     * during byes the cousin may point this at a late Saturday college game.
     */
    tiebreakerGameId: uuid("tiebreaker_game_id"),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weeks_season_number_key").on(t.seasonId, t.weekNumber)],
);

/** 'nfl' for the normal slate, 'ncaaf' for bye-week college fill-ins. */
export type League = "nfl" | "ncaaf";
export type GameStatus = "scheduled" | "in_progress" | "final" | "postponed";

export const games = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weekId: integer("week_id").notNull().references(() => weeks.id, { onDelete: "cascade" }),
    league: text("league").$type<League>().notNull().default("nfl"),

    /** ESPN event id. The join key for live score polling. */
    espnId: text("espn_id"),

    homeTeam: text("home_team").notNull(),
    homeAbbr: text("home_abbr"),
    awayTeam: text("away_team").notNull(),
    awayAbbr: text("away_abbr"),

    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),

    /**
     * Canonical line, always from the HOME team's perspective.
     * -3.5 => home favoured by 3.5.  +6.5 => home getting 6.5.
     * Null until the odds sync (or the cousin) fills it in.
     */
    spread: numeric("spread", { precision: 4, scale: 1 }),
    /** Set when the cousin overrides the book. Blocks the sync from clobbering it. */
    spreadIsManual: boolean("spread_is_manual").notNull().default(false),

    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    status: text("status").$type<GameStatus>().notNull().default("scheduled"),
    /** Free-text live clock straight from ESPN, e.g. "8:42 - 3rd". */
    statusDetail: text("status_detail"),

    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("games_week_idx").on(t.weekId),
    uniqueIndex("games_week_espn_key").on(t.weekId, t.espnId),
  ],
);

export const picks = pgTable(
  "picks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    /** Which side they took. */
    selection: text("selection").$type<"home" | "away">().notNull(),
    /** True when the cousin fixed it up on someone's behalf. Shown in the audit column. */
    editedByAdmin: boolean("edited_by_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("picks_player_game_key").on(t.playerId, t.gameId),
    index("picks_game_idx").on(t.gameId),
  ],
);

/** One row per player per week: holds the tiebreaker guess. */
export const weekEntries = pgTable(
  "week_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    weekId: integer("week_id").notNull().references(() => weeks.id, { onDelete: "cascade" }),
    /** Predicted combined points in the tiebreaker game. */
    tiebreakerTotal: integer("tiebreaker_total"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("week_entries_player_week_key").on(t.playerId, t.weekId)],
);

/** Hashed single-use magic-link tokens. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("login_tokens_hash_key").on(t.tokenHash)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const seasonsRelations = relations(seasons, ({ many }) => ({ weeks: many(weeks) }));
export const weeksRelations = relations(weeks, ({ one, many }) => ({
  season: one(seasons, { fields: [weeks.seasonId], references: [seasons.id] }),
  games: many(games),
}));
export const gamesRelations = relations(games, ({ one, many }) => ({
  week: one(weeks, { fields: [games.weekId], references: [weeks.id] }),
  picks: many(picks),
}));
export const picksRelations = relations(picks, ({ one }) => ({
  player: one(players, { fields: [picks.playerId], references: [players.id] }),
  game: one(games, { fields: [picks.gameId], references: [games.id] }),
}));

export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Pick = typeof picks.$inferSelect;
export type Week = typeof weeks.$inferSelect;
