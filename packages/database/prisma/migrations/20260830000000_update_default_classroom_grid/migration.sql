-- Align newly created classrooms with the default seating layout.
ALTER TABLE "Classroom" ALTER COLUMN "gridRows" SET DEFAULT 7;
ALTER TABLE "Classroom" ALTER COLUMN "gridCols" SET DEFAULT 11;
