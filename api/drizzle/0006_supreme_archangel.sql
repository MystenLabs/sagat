CREATE TABLE "multisig_proposers" (
	"multisig_address" text NOT NULL,
	"address" text NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp DEFAULT NOW() NOT NULL,
	CONSTRAINT "multisig_proposers_multisig_address_address_pk" PRIMARY KEY("multisig_address","address")
);
--> statement-breakpoint
ALTER TABLE "multisig_members" DROP CONSTRAINT "multisig_members_public_key_addresses_public_key_fk";
--> statement-breakpoint
ALTER TABLE "proposal_signatures" DROP CONSTRAINT "proposal_signatures_public_key_addresses_public_key_fk";
--> statement-breakpoint
ALTER TABLE "multisig_proposers" ADD CONSTRAINT "multisig_proposers_multisig_address_multisigs_address_fk" FOREIGN KEY ("multisig_address") REFERENCES "public"."multisigs"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multisig_members" ADD CONSTRAINT "multisig_members_public_key_addresses_public_key_fk" FOREIGN KEY ("public_key") REFERENCES "public"."addresses"("public_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_signatures" ADD CONSTRAINT "proposal_signatures_public_key_addresses_public_key_fk" FOREIGN KEY ("public_key") REFERENCES "public"."addresses"("public_key") ON DELETE no action ON UPDATE no action;