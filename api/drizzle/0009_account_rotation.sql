-- Account rotation, phase 1. Hand-written: renames only, no table or column is dropped.
-- The one index dropped, `multisig_address_idx`, duplicated the primary key of `multisigs`.
-- Renames are metadata changes; the only data written is one `accounts` row and
-- one `account_signer_sets` row (the account and its original signer set) per
-- existing multisig.
ALTER TABLE "multisigs" RENAME TO "signer_sets";--> statement-breakpoint
ALTER TABLE "multisig_members" RENAME TO "signer_set_members";--> statement-breakpoint
ALTER TABLE "multisig_proposers" RENAME TO "account_proposers";--> statement-breakpoint
ALTER TABLE "signer_set_members" RENAME COLUMN "multisig_address" TO "signer_set_address";--> statement-breakpoint
ALTER TABLE "account_proposers" RENAME COLUMN "multisig_address" TO "account_address";--> statement-breakpoint
ALTER TABLE "proposals" RENAME COLUMN "multisig_address" TO "account_address";--> statement-breakpoint
ALTER TABLE "signer_sets" RENAME CONSTRAINT "multisigs_pkey" TO "signer_sets_pkey";--> statement-breakpoint
ALTER TABLE "signer_set_members" RENAME CONSTRAINT "multisig_members_multisig_address_multisigs_address_fk" TO "signer_set_members_signer_set_address_signer_sets_address_fk";--> statement-breakpoint
ALTER TABLE "signer_set_members" RENAME CONSTRAINT "multisig_members_public_key_addresses_public_key_fk" TO "signer_set_members_public_key_addresses_public_key_fk";--> statement-breakpoint
ALTER TABLE "account_proposers" RENAME CONSTRAINT "multisig_proposers_multisig_address_address_pk" TO "account_proposers_account_address_address_pk";--> statement-breakpoint
DROP INDEX "multisig_address_idx";--> statement-breakpoint
ALTER INDEX "multisig_member_idx" RENAME TO "signer_set_member_idx";--> statement-breakpoint
ALTER INDEX "multisig_member_multisig_address_idx" RENAME TO "signer_set_member_signer_set_address_idx";--> statement-breakpoint
ALTER INDEX "multisig_member_public_key_idx" RENAME TO "signer_set_member_public_key_idx";--> statement-breakpoint
ALTER INDEX "proposals_multisig_address_idx" RENAME TO "proposals_account_address_idx";--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "executed_via" text;--> statement-breakpoint
CREATE TABLE "accounts" (
	"address" text PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"created_at" timestamp DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
INSERT INTO "accounts" ("address", "name") SELECT "address", "name" FROM "signer_sets";--> statement-breakpoint
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_multisig_address_multisigs_address_fk";--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_account_address_accounts_address_fk" FOREIGN KEY ("account_address") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_proposers" DROP CONSTRAINT "multisig_proposers_multisig_address_multisigs_address_fk";--> statement-breakpoint
ALTER TABLE "account_proposers" ADD CONSTRAINT "account_proposers_account_address_accounts_address_fk" FOREIGN KEY ("account_address") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "account_aliases" (
	"account_address" text NOT NULL,
	"network" text NOT NULL,
	"alias_address" text NOT NULL,
	CONSTRAINT "account_aliases_account_address_network_alias_address_pk" PRIMARY KEY("account_address","network","alias_address"),
	CONSTRAINT "account_aliases_network_check" CHECK ("account_aliases"."network" IN ('mainnet', 'testnet', 'devnet', 'localnet'))
);
--> statement-breakpoint
CREATE TABLE "account_alias_state" (
	"account_address" text NOT NULL,
	"network" text NOT NULL,
	"exists" boolean NOT NULL,
	"observed_version" bigint,
	"observed_at" timestamp NOT NULL,
	CONSTRAINT "account_alias_state_account_address_network_pk" PRIMARY KEY("account_address","network"),
	CONSTRAINT "account_alias_state_network_check" CHECK ("account_alias_state"."network" IN ('mainnet', 'testnet', 'devnet', 'localnet'))
);
--> statement-breakpoint
CREATE TABLE "account_signer_sets" (
	"account_address" text NOT NULL,
	"signer_set_address" text NOT NULL,
	"label" varchar(255),
	"status" text DEFAULT 'draft' NOT NULL,
	"drafted_by" text NOT NULL,
	"created_at" timestamp DEFAULT NOW() NOT NULL,
	CONSTRAINT "account_signer_sets_account_address_signer_set_address_pk" PRIMARY KEY("account_address","signer_set_address"),
	CONSTRAINT "account_signer_sets_status_check" CHECK ("account_signer_sets"."status" IN ('draft', 'inviting', 'verified', 'abandoned'))
);
--> statement-breakpoint
ALTER TABLE "account_aliases" ADD CONSTRAINT "account_aliases_account_address_accounts_address_fk" FOREIGN KEY ("account_address") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_alias_state" ADD CONSTRAINT "account_alias_state_account_address_accounts_address_fk" FOREIGN KEY ("account_address") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_signer_sets" ADD CONSTRAINT "account_signer_sets_account_address_accounts_address_fk" FOREIGN KEY ("account_address") REFERENCES "public"."accounts"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_signer_sets" ADD CONSTRAINT "account_signer_sets_signer_set_address_signer_sets_address_fk" FOREIGN KEY ("signer_set_address") REFERENCES "public"."signer_sets"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Every existing multisig is its own original signer set: link each account to it.
INSERT INTO "account_signer_sets" ("account_address", "signer_set_address", "label", "status", "drafted_by", "created_at")
SELECT "accounts"."address", "accounts"."address", "signer_sets"."name", CASE WHEN "signer_sets"."is_verified" THEN 'verified' ELSE 'inviting' END, "accounts"."address", NOW()
FROM "accounts" INNER JOIN "signer_sets" ON "signer_sets"."address" = "accounts"."address";
