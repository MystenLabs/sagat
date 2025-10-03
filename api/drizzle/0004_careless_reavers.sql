ALTER TABLE "addresses" ADD COLUMN "schema" text DEFAULT 'ED25519' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_address_idx" ON "addresses" USING btree ("address");