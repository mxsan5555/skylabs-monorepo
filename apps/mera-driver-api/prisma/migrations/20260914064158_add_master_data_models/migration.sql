-- CreateTable
CREATE TABLE "MasterListItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',

    CONSTRAINT "MasterListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleType" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',

    CONSTRAINT "VehicleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceZone" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "zoneName" TEXT NOT NULL,
    "zoneCode" TEXT NOT NULL,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "areaName" TEXT,
    "pincode" TEXT,
    "zoneType" TEXT NOT NULL DEFAULT 'City',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusKm" DOUBLE PRECISION,
    "boundaryData" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT,

    CONSTRAINT "ServiceZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterListItem_category_idx" ON "MasterListItem"("category");

-- CreateIndex
CREATE UNIQUE INDEX "MasterListItem_category_name_key" ON "MasterListItem"("category", "name");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleType_code_key" ON "VehicleType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceZone_zoneCode_key" ON "ServiceZone"("zoneCode");
