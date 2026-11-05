CREATE TABLE "account_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_address" text NOT NULL,
	"network" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text,
	"before" jsonb,
	"after" jsonb,
	"proof" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_events_network_check" CHECK ("account_events"."network" IN ('mainnet', 'testnet', 'devnet', 'localnet'))
);
--> statement-breakpoint
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_account_address_accounts_address_fk" FOREIGN KEY ("account_address") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_events_account_id_idx" ON "account_events" USING btree ("account_address","id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "account_events_account_action_id_idx" ON "account_events" USING btree ("account_address","action","id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "account_events_account_subject_id_idx" ON "account_events" USING btree ("account_address","subject","id" DESC NULLS FIRST);