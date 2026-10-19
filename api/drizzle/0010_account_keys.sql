CREATE TABLE "account_keys" (
	"account_address" text NOT NULL,
	"public_key" text NOT NULL,
	"label" varchar(255),
	"updated_by" text NOT NULL,
	"updated_at" timestamp DEFAULT NOW() NOT NULL,
	CONSTRAINT "account_keys_account_address_public_key_pk" PRIMARY KEY("account_address","public_key")
);
--> statement-breakpoint
ALTER TABLE "account_keys" ADD CONSTRAINT "account_keys_account_address_accounts_address_fk" FOREIGN KEY ("account_address") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_keys" ADD CONSTRAINT "account_keys_public_key_addresses_public_key_fk" FOREIGN KEY ("public_key") REFERENCES "public"."addresses"("public_key") ON DELETE no action ON UPDATE no action;