-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "profileImage" TEXT,
    "mobileNumber" TEXT NOT NULL,
    "email" TEXT,
    "dateOfBirth" TEXT,
    "gender" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "pincode" TEXT,
    "alternatePhone" TEXT,
    "customerType" TEXT,
    "registrationSource" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'Pending',
    "accountStatus" TEXT NOT NULL DEFAULT 'Active',
    "lastLoginAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "fatherName" TEXT,
    "motherName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "emergencyNumber" TEXT,
    "dob" TEXT,
    "maritalStatus" TEXT,
    "gender" TEXT,
    "passportNumber" TEXT,
    "religion" TEXT,
    "color" TEXT,
    "language" TEXT,
    "age" TEXT,
    "height" TEXT,
    "weight" TEXT,
    "country" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "address" TEXT,
    "driverType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Non-Verified',
    "sourceType" TEXT,
    "vehicle" TEXT,
    "avatar" TEXT,
    "education" TEXT,
    "trainingStatus" TEXT,
    "trainingCertificate" TEXT,
    "eyeVision" TEXT,
    "healthInsurance" TEXT,
    "bloodGroup" TEXT,
    "licenseDetails" TEXT,
    "vehicleType" TEXT,
    "dlNo" TEXT,
    "dlIssueDate" TEXT,
    "dlExpiryDate" TEXT,
    "policeVerifiedStatus" TEXT,
    "policeVerifiedNo" TEXT,
    "jobType" TEXT,
    "experience" TEXT,
    "currentSalary" TEXT,
    "expectedSalary" TEXT,
    "preferredPaymentMode" TEXT,
    "amount" TEXT,
    "paymentReceiptDate" TEXT,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "ifscCode" TEXT,
    "branchName" TEXT,
    "upiIdOrChequeNo" TEXT,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "regNo" TEXT,
    "fileName" TEXT,
    "filePath" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,

    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vehicleUid" TEXT NOT NULL,
    "customerId" INTEGER,
    "vehicleNumber" TEXT NOT NULL,
    "vehicleTypeId" INTEGER NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "variant" TEXT,
    "manufacturingYear" TEXT,
    "fuelType" TEXT,
    "transmission" TEXT,
    "color" TEXT,
    "rcNumber" TEXT,
    "rcExpiryDate" TEXT,
    "insuranceNumber" TEXT,
    "insuranceExpiryDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "attendanceDate" TEXT NOT NULL,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "checkInLatitude" DOUBLE PRECISION,
    "checkInLongitude" DOUBLE PRECISION,
    "checkOutLatitude" DOUBLE PRECISION,
    "checkOutLongitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'Present',
    "totalHours" DOUBLE PRECISION,
    "assignedTripId" TEXT,
    "leaveType" TEXT,
    "leaveReason" TEXT,
    "remarks" TEXT,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripType" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TripType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "driverName" TEXT,
    "vehicleName" TEXT,
    "vehicleCategory" TEXT,
    "tripTypeName" TEXT,
    "pickupAddress" TEXT,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "dropAddress" TEXT,
    "dropLat" DOUBLE PRECISION,
    "dropLng" DOUBLE PRECISION,
    "scheduledAt" TEXT,
    "estimatedDistanceKm" DOUBLE PRECISION,
    "estimatedDurationMin" DOUBLE PRECISION,
    "estimatedFare" DOUBLE PRECISION,
    "finalFare" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentMode" TEXT NOT NULL DEFAULT 'cash',
    "otp" TEXT,
    "requestedAt" TEXT,
    "acceptedAt" TEXT,
    "startedAt" TEXT,
    "completedAt" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverLocation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverName" TEXT NOT NULL,
    "phone" TEXT,
    "vehicle" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Online',
    "recordedAt" TEXT,

    CONSTRAINT "DriverLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationReason" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'Customer',
    "penaltyApplicable" TEXT NOT NULL DEFAULT 'No',
    "status" TEXT NOT NULL DEFAULT 'Active',

    CONSTRAINT "CancellationReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FareRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vehicleCategoryName" TEXT NOT NULL,
    "tripTypeName" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "baseFare" DOUBLE PRECISION NOT NULL,
    "perKmRate" DOUBLE PRECISION NOT NULL,
    "perMinRate" DOUBLE PRECISION NOT NULL,
    "waitingChargePerMin" DOUBLE PRECISION NOT NULL,
    "minFare" DOUBLE PRECISION NOT NULL,
    "driverAllowance" DOUBLE PRECISION NOT NULL,
    "tollIncluded" BOOLEAN NOT NULL DEFAULT false,
    "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "effectiveFrom" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FareRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_mobileNumber_key" ON "Customer"("mobileNumber");

-- CreateIndex
CREATE INDEX "Customer_verificationStatus_idx" ON "Customer"("verificationStatus");

-- CreateIndex
CREATE INDEX "Customer_accountStatus_idx" ON "Customer"("accountStatus");

-- CreateIndex
CREATE INDEX "Driver_status_idx" ON "Driver"("status");

-- CreateIndex
CREATE INDEX "DriverDocument_driverId_idx" ON "DriverDocument"("driverId");

-- CreateIndex
CREATE INDEX "DriverDocument_category_idx" ON "DriverDocument"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vehicleUid_key" ON "Vehicle"("vehicleUid");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vehicleNumber_key" ON "Vehicle"("vehicleNumber");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE INDEX "AttendanceRecord_driverId_idx" ON "AttendanceRecord"("driverId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_status_idx" ON "AttendanceRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingCode_key" ON "Booking"("bookingCode");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationReason_code_key" ON "CancellationReason"("code");

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
