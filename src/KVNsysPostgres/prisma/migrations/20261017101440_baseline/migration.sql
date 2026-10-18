-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT,
    "region_code" TEXT,
    "province_code" TEXT,
    "municipality_code" TEXT,
    "barangay_code" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT,
    "updated_by_user" UUID,
    "updated_at_machine" UUID,
    "updated_at_location" UUID,
    "updated_at_date" TIMESTAMPTZ(6),
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT,
    "updated_by_user" UUID,
    "updated_at_machine" UUID,
    "updated_at_location" UUID,
    "updated_at_date" TIMESTAMPTZ(6),
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accesses" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "access" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT,
    "updated_by_user" UUID,
    "updated_at_machine" UUID,
    "updated_at_location" UUID,
    "updated_at_date" TIMESTAMPTZ(6),
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machine_uuid" TEXT,
    "machine_name" TEXT,
    "location_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT,
    "updated_by_user" UUID,
    "updated_at_machine" UUID,
    "updated_at_location" UUID,
    "updated_at_date" TIMESTAMPTZ(6),
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "retail_price" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT,
    "updated_by_user" UUID,
    "updated_at_machine" UUID,
    "updated_at_location" UUID,
    "updated_at_date" TIMESTAMPTZ(6),
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accesses_role_id_access_key" ON "accesses"("role_id", "access");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "machines_code_key" ON "machines"("code");

-- CreateIndex
CREATE UNIQUE INDEX "machines_machine_uuid_key" ON "machines"("machine_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- AddForeignKey
ALTER TABLE "accesses" ADD CONSTRAINT "accesses_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A price is never negative. Prisma's schema has no way to say so, so it's written here.
ALTER TABLE "products" ADD CONSTRAINT "products_retail_price_not_negative" CHECK ("retail_price" >= 0);
