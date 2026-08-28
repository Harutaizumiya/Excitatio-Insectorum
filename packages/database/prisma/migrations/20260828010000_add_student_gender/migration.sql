-- Add optional import metadata while keeping existing students valid.
CREATE TYPE "StudentGender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

ALTER TABLE "Student"
  ADD COLUMN "gender" "StudentGender" NOT NULL DEFAULT 'UNKNOWN';
