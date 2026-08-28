-- Preserve existing layouts as ordinary seats while allowing explicit layout cells.
CREATE TYPE "SeatCellType" AS ENUM ('SEAT', 'AISLE', 'PODIUM', 'EMPTY');

ALTER TABLE "Seat" ADD COLUMN "cellType" "SeatCellType" NOT NULL DEFAULT 'SEAT';
