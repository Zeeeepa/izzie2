-- Migration: Add alert_preferences table for real-time alert configuration
-- Stores user preferences for urgent email alerts including VIP senders,
-- quiet hours, notification channels, and per-priority toggles

-- alert_preferences table
CREATE TABLE IF NOT EXISTS "alert_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE,

  -- VIP Senders - email addresses that boost priority
  "vip_senders" text[] DEFAULT ARRAY[]::text[] NOT NULL,

  -- Custom urgent keywords (extends defaults)
  "custom_urgent_keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,

  -- Quiet Hours configuration
  "quiet_hours_enabled" boolean DEFAULT true NOT NULL,
  "quiet_hours_start" text DEFAULT '22:00' NOT NULL,
  "quiet_hours_end" text DEFAULT '07:00' NOT NULL,
  "quiet_hours_timezone" text DEFAULT 'America/New_York' NOT NULL,

  -- Notification toggles
  "telegram_enabled" boolean DEFAULT true NOT NULL,
  "email_enabled" boolean DEFAULT false NOT NULL,

  -- Per-priority toggles
  "notify_on_p0" boolean DEFAULT true NOT NULL,
  "notify_on_p1" boolean DEFAULT true NOT NULL,
  "notify_on_p2" boolean DEFAULT false NOT NULL,

  -- Timestamps
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "alert_preferences_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create index for user lookup
CREATE INDEX IF NOT EXISTS "alert_preferences_user_id_idx" ON "alert_preferences" ("user_id");
