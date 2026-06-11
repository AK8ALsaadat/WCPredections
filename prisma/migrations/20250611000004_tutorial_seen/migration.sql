ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "has_seen_tutorial" BOOLEAN NOT NULL DEFAULT false;

-- المستخدمون الحاليون سبق شافوا التطبيق
UPDATE "users" SET "has_seen_tutorial" = true WHERE "has_seen_tutorial" = false;
