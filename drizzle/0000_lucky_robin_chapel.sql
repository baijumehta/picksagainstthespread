CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" integer NOT NULL,
	"league" text DEFAULT 'nfl' NOT NULL,
	"espn_id" text,
	"home_team" text NOT NULL,
	"home_abbr" text,
	"away_team" text NOT NULL,
	"away_abbr" text,
	"kickoff_at" timestamp with time zone NOT NULL,
	"spread" numeric(4, 1),
	"spread_is_manual" boolean DEFAULT false NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"status_detail" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"selection" text NOT NULL,
	"edited_by_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initials" text NOT NULL,
	"full_name" text,
	"email" text NOT NULL,
	"phone" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "week_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"week_id" integer NOT NULL,
	"tiebreaker_total" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"label" text NOT NULL,
	"tiebreaker_game_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_entries" ADD CONSTRAINT "week_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_entries" ADD CONSTRAINT "week_entries_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_week_idx" ON "games" USING btree ("week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "games_week_espn_key" ON "games" USING btree ("week_id","espn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_hash_key" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "picks_player_game_key" ON "picks" USING btree ("player_id","game_id");--> statement-breakpoint
CREATE INDEX "picks_game_idx" ON "picks" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_initials_key" ON "players" USING btree ("initials");--> statement-breakpoint
CREATE UNIQUE INDEX "players_email_key" ON "players" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_year_key" ON "seasons" USING btree ("year");--> statement-breakpoint
CREATE UNIQUE INDEX "week_entries_player_week_key" ON "week_entries" USING btree ("player_id","week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weeks_season_number_key" ON "weeks" USING btree ("season_id","week_number");