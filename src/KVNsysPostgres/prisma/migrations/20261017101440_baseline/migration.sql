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

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount_total" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "discount_kind" TEXT,
    "discount_id_number" TEXT,
    "discount_customer_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Paid',
    "description" TEXT,
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_items" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount_value" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "price_basis" TEXT NOT NULL DEFAULT 'Retail',

    CONSTRAINT "receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_payments" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "payment_type" TEXT NOT NULL,
    "amount_tendered" DECIMAL(14,2) NOT NULL,
    "change_given" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_payments_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "receipts_code_key" ON "receipts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_location_id_number_key" ON "receipts"("location_id", "number");

-- CreateIndex
CREATE INDEX "receipts_location_id_created_at_date_idx" ON "receipts"("location_id", "created_at_date");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_items_receipt_id_line_number_key" ON "receipt_items"("receipt_id", "line_number");

-- CreateIndex
CREATE INDEX "receipt_payments_receipt_id_idx" ON "receipt_payments"("receipt_id");

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

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_payments" ADD CONSTRAINT "receipt_payments_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- Selling's rules, which Prisma's schema can't say either.
-- A receipt's money is never negative, its number counts from 1, and it adds up.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_money_not_negative" CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "total" >= 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_total_adds_up" CHECK ("total" = "subtotal" - "discount_total");
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_number_from_one" CHECK ("number" >= 1);
-- A statutory discount names whose ID it was: the kind, the ID number and the name, or none of them.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_discount_whole" CHECK (
  ("discount_kind" IS NULL AND "discount_id_number" IS NULL AND "discount_customer_name" IS NULL)
  OR ("discount_kind" IN ('senior', 'pwd') AND "discount_id_number" IS NOT NULL AND "discount_customer_name" IS NOT NULL)
);
-- Paid only, for now. Voiding comes with rules of its own.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_status_known" CHECK ("status" IN ('Paid'));
-- A line sells at least one piece, and adds up.
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_adds_up" CHECK (
  "quantity" >= 1 AND "unit_price" >= 0 AND "discount_value" >= 0 AND "line_total" >= 0
  AND "line_total" = "quantity" * "unit_price" - "discount_value"
);
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_price_basis_known" CHECK ("price_basis" IN ('Retail'));
-- Cash only, for now. The change is never more than what was handed over.
ALTER TABLE "receipt_payments" ADD CONSTRAINT "receipt_payments_type_known" CHECK ("payment_type" IN ('Cash'));
ALTER TABLE "receipt_payments" ADD CONSTRAINT "receipt_payments_money_sensible" CHECK (
  "amount_tendered" >= 0 AND "change_given" >= 0 AND "change_given" <= "amount_tendered"
);

-- A receipt is kept as it was given: its header, its lines and its payment are never changed or removed.
CREATE FUNCTION "receipts_are_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is kept as it was given: a receipt is never changed or removed', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER "receipts_no_update_or_delete" BEFORE UPDATE OR DELETE ON "receipts"
  FOR EACH ROW EXECUTE FUNCTION "receipts_are_kept"();
CREATE TRIGGER "receipts_no_truncate" BEFORE TRUNCATE ON "receipts"
  FOR EACH STATEMENT EXECUTE FUNCTION "receipts_are_kept"();
CREATE TRIGGER "receipt_items_no_update_or_delete" BEFORE UPDATE OR DELETE ON "receipt_items"
  FOR EACH ROW EXECUTE FUNCTION "receipts_are_kept"();
CREATE TRIGGER "receipt_items_no_truncate" BEFORE TRUNCATE ON "receipt_items"
  FOR EACH STATEMENT EXECUTE FUNCTION "receipts_are_kept"();
CREATE TRIGGER "receipt_payments_no_update_or_delete" BEFORE UPDATE OR DELETE ON "receipt_payments"
  FOR EACH ROW EXECUTE FUNCTION "receipts_are_kept"();
CREATE TRIGGER "receipt_payments_no_truncate" BEFORE TRUNCATE ON "receipt_payments"
  FOR EACH STATEMENT EXECUTE FUNCTION "receipts_are_kept"();
