CREATE TABLE "credential_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_secret_hash" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"credentials_iv" text NOT NULL,
	"credentials_tag" text NOT NULL,
	"source" text NOT NULL,
	"label" text,
	"connected_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_key_bucket_window_unique" ON "rate_limits" USING btree ("key","bucket","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_images_run_upload_order_unique" ON "reference_images" USING btree ("run_id","upload_order");