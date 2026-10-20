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

-- CreateTable
CREATE TABLE "inventory" (
    "location_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "updated_by_user" UUID,
    "updated_at_machine" UUID,
    "updated_at_location" UUID,
    "updated_at_date" TIMESTAMPTZ(6),
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("location_id","product_id")
);

-- CreateTable
CREATE TABLE "inventory_logs" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "movement_type" TEXT NOT NULL,
    "source_table" TEXT,
    "source_id" UUID,
    "resulting_on_hand" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "inventory_logs_location_id_product_id_created_at_date_idx" ON "inventory_logs"("location_id", "product_id", "created_at_date");

-- AddForeignKey
ALTER TABLE "accesses" ADD CONSTRAINT "accesses_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A price is never negative. Prisma's schema has no way to say so, so it's written here.
ALTER TABLE "products" ADD CONSTRAINT "products_retail_price_not_negative" CHECK ("retail_price" >= 0);

-- The stock ledger's rules, which Prisma's schema can't say either.
-- A line moves at least one piece, in or out.
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_quantity_change_not_zero" CHECK ("quantity_change" <> 0);
-- Why stock moved. KVNsysCore's MovementTypes lists the same ones; SCHEMA-PLAN's others come with
-- the features that need them.
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_movement_type_known" CHECK ("movement_type" IN ('from_supplier', 'to_customer', 'adjustment'));
-- Which document caused it: both halves, or neither.
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_source_whole" CHECK (("source_table" IS NULL) = ("source_id" IS NULL));

-- The ledger is append-only: a line is never changed or removed, only answered by another line.
CREATE FUNCTION "inventory_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory_logs is append-only: put a mistake right with a new line, never by changing one';
END;
$$;
CREATE TRIGGER "inventory_logs_no_update_or_delete" BEFORE UPDATE OR DELETE ON "inventory_logs"
  FOR EACH ROW EXECUTE FUNCTION "inventory_logs_append_only"();
CREATE TRIGGER "inventory_logs_no_truncate" BEFORE TRUNCATE ON "inventory_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "inventory_logs_append_only"();
