ALTER TABLE "multisig_members" DROP CONSTRAINT "multisig_members_public_key_addresses_public_key_fk";
--> statement-breakpoint
ALTER TABLE "proposal_signatures" DROP CONSTRAINT "proposal_signatures_public_key_addresses_public_key_fk";
--> statement-breakpoint
ALTER TABLE "multisig_members" ADD CONSTRAINT "multisig_members_public_key_addresses_public_key_fk" FOREIGN KEY ("public_key") REFERENCES "public"."addresses"("public_key") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "proposal_signatures" ADD CONSTRAINT "proposal_signatures_public_key_addresses_public_key_fk" FOREIGN KEY ("public_key") REFERENCES "public"."addresses"("public_key") ON DELETE no action ON UPDATE cascade;