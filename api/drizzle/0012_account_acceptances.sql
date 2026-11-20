CREATE TABLE "account_acceptances" (
	"account_address" text NOT NULL,
	"public_key" text NOT NULL,
	"is_accepted" boolean DEFAULT false NOT NULL,
	"is_rejected" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_acceptances_account_address_public_key_pk" PRIMARY KEY("account_address","public_key"),
	CONSTRAINT "account_acceptances_answer_check" CHECK ("account_acceptances"."is_accepted" <> "account_acceptances"."is_rejected")
);
--> statement-breakpoint
ALTER TABLE "account_acceptances" ADD CONSTRAINT "account_acceptances_account_address_accounts_address_fk" FOREIGN KEY ("account_address") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_acceptances" ADD CONSTRAINT "account_acceptances_public_key_addresses_public_key_fk" FOREIGN KEY ("public_key") REFERENCES "public"."addresses"("public_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_aliases_alias_network_idx" ON "account_aliases" USING btree ("alias_address","network");