ALTER TABLE "runs" ADD COLUMN "credential_mode" text DEFAULT 'openrouter' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "encrypted_credentials" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "credentials_iv" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "credentials_tag" text;--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "encrypted_ai_gateway_token";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "ai_gateway_token_iv";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "ai_gateway_token_tag";