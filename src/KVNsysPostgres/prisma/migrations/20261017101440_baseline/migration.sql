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
    "image" BYTEA,
    "category_id" UUID,
    "brand_id" UUID,
    "supplier_id" UUID,
    "manufacturer_id" UUID,
    "unit_of_measure" TEXT,
    "tracks_stock" BOOLEAN NOT NULL DEFAULT true,
    "cost_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retail_price" DECIMAL(14,2) NOT NULL,
    "promo_price" DECIMAL(14,2),
    "wholesale_price" DECIMAL(14,2),
    "wholesale_quantity" INTEGER,
    "has_warranty" BOOLEAN NOT NULL DEFAULT false,
    "warranty_months" INTEGER NOT NULL DEFAULT 0,
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
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "max_stock" INTEGER,
    "reorder_point" INTEGER NOT NULL DEFAULT 0,
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
    "shift_id" UUID,
    "location_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount_total" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "discount_kind" TEXT,
    "discount_id_number" TEXT,
    "discount_customer_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Paid',
    "void_reason" TEXT,
    "description" TEXT,
    "opened_by_user" UUID,
    "opened_at_machine" UUID,
    "opened_at_location" UUID,
    "opened_at_date" TIMESTAMPTZ(6),
    "settled_by_user" UUID,
    "settled_at_machine" UUID,
    "settled_at_location" UUID,
    "settled_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_by_user" UUID,
    "voided_at_machine" UUID,
    "voided_at_location" UUID,
    "voided_at_date" TIMESTAMPTZ(6),

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

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "opening_cash" DECIMAL(14,2) NOT NULL,
    "expected_cash" DECIMAL(14,2),
    "counted_cash" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'Open',
    "description" TEXT,
    "opened_by_user" UUID,
    "opened_at_machine" UUID,
    "opened_at_location" UUID,
    "opened_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_user" UUID,
    "closed_at_machine" UUID,
    "closed_at_location" UUID,
    "closed_at_date" TIMESTAMPTZ(6),

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "regions" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "provinces" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region_code" TEXT NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "municipalities" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province_code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Municipality',

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "barangays" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "municipality_code" TEXT NOT NULL,

    CONSTRAINT "barangays_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "audits" (
    "id" UUID NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" UUID NOT NULL,
    "column_name" TEXT,
    "value_before" TEXT,
    "value_after" TEXT,
    "change_type" TEXT NOT NULL,
    "change_source" TEXT NOT NULL,
    "implemented_by_user" UUID,
    "implemented_at_machine" UUID,
    "implemented_at_location" UUID,
    "implemented_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_category_id" UUID,
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

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliations" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "brand_id" UUID,
    "manufacturer_id" UUID,
    "supplier_id" UUID,
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_documents" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source_supplier_id" UUID,
    "source_location_id" UUID,
    "destination_supplier_id" UUID,
    "destination_location_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "updated_by_user" UUID,
    "updated_at_machine" UUID,
    "updated_at_location" UUID,
    "updated_at_date" TIMESTAMPTZ(6),
    "created_by_user" UUID,
    "created_at_machine" UUID,
    "created_at_location" UUID,
    "created_at_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_document_items" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "expected_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_document_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_imports" (
    "document_id" UUID NOT NULL,
    "from_location" UUID NOT NULL,
    "to_location" UUID NOT NULL,
    "created_at_source" TIMESTAMPTZ(6) NOT NULL,
    "line_count" INTEGER NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_imports_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "sales_imports" (
    "document_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_imports_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "consolidated_sales" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "consolidated_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "settings" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
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
CREATE INDEX "receipts_location_id_settled_at_date_idx" ON "receipts"("location_id", "settled_at_date");

-- CreateIndex
CREATE INDEX "receipts_shift_id_idx" ON "receipts"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_location_id_number_key" ON "receipts"("location_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_items_receipt_id_line_number_key" ON "receipt_items"("receipt_id", "line_number");

-- CreateIndex
CREATE INDEX "receipt_payments_receipt_id_idx" ON "receipt_payments"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_code_key" ON "shifts"("code");

-- CreateIndex
CREATE INDEX "shifts_location_id_opened_by_user_status_idx" ON "shifts"("location_id", "opened_by_user", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_location_id_number_key" ON "shifts"("location_id", "number");

-- CreateIndex
CREATE INDEX "audits_table_name_record_id_idx" ON "audits"("table_name", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_code_key" ON "brands"("code");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_code_key" ON "manufacturers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_code_key" ON "stock_documents"("code");

-- CreateIndex
CREATE INDEX "stock_document_items_document_id_idx" ON "stock_document_items"("document_id");

-- CreateIndex
CREATE INDEX "consolidated_sales_product_id_idx" ON "consolidated_sales"("product_id");

-- CreateIndex
CREATE INDEX "consolidated_sales_location_id_idx" ON "consolidated_sales"("location_id");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_region_code_fkey" FOREIGN KEY ("region_code") REFERENCES "regions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_municipality_code_fkey" FOREIGN KEY ("municipality_code") REFERENCES "municipalities"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_barangay_code_fkey" FOREIGN KEY ("barangay_code") REFERENCES "barangays"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesses" ADD CONSTRAINT "accesses_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_payments" ADD CONSTRAINT "receipt_payments_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provinces" ADD CONSTRAINT "provinces_region_code_fkey" FOREIGN KEY ("region_code") REFERENCES "regions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barangays" ADD CONSTRAINT "barangays_municipality_code_fkey" FOREIGN KEY ("municipality_code") REFERENCES "municipalities"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_source_supplier_id_fkey" FOREIGN KEY ("source_supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_destination_supplier_id_fkey" FOREIGN KEY ("destination_supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_document_items" ADD CONSTRAINT "stock_document_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_document_items" ADD CONSTRAINT "stock_document_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_imports" ADD CONSTRAINT "transfer_imports_to_location_fkey" FOREIGN KEY ("to_location") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidated_sales" ADD CONSTRAINT "consolidated_sales_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "sales_imports"("document_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidated_sales" ADD CONSTRAINT "consolidated_sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A price is never negative. Prisma's schema has no way to say so, so it's written here.
ALTER TABLE "products" ADD CONSTRAINT "products_retail_price_not_negative" CHECK ("retail_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_other_prices_not_negative" CHECK (
  "cost_price" >= 0 AND ("promo_price" IS NULL OR "promo_price" >= 0) AND ("wholesale_price" IS NULL OR "wholesale_price" >= 0)
);
-- A wholesale sale is at least one piece, and a warranty lasts zero months or more.
ALTER TABLE "products" ADD CONSTRAINT "products_wholesale_quantity_sensible" CHECK ("wholesale_quantity" IS NULL OR "wholesale_quantity" >= 1);
ALTER TABLE "products" ADD CONSTRAINT "products_warranty_months_not_negative" CHECK ("warranty_months" >= 0);

-- Reorder levels: never below zero, and a ceiling (when there is one) never below the floor.
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_reorder_levels_sensible" CHECK (
  "min_stock" >= 0 AND "reorder_point" >= 0 AND ("max_stock" IS NULL OR "max_stock" >= "min_stock")
);

-- A city or a municipality, nothing else (SCHEMA-PLAN 1–5).
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_type_known" CHECK ("type" IN ('Municipality', 'City'));

-- The stock ledger's rules, which Prisma's schema can't say either.
-- A line moves at least one piece, in or out.
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_quantity_change_not_zero" CHECK ("quantity_change" <> 0);
-- Why stock moved: SCHEMA-PLAN's seven kinds, named by both parties. KVNsysCore records the ones
-- built so far (MovementTypes); the rest come with the features that make them.
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_movement_type_known" CHECK (
  "movement_type" IN ('from_supplier', 'to_supplier', 'transfer', 'to_customer', 'from_customer', 'disposal', 'adjustment')
);
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
-- Paid, or Voided. A voided receipt says why and when; a paid one says neither. Voiding itself isn't
-- built: the rule below that keeps receipts as they were given still refuses every change.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_status_known" CHECK ("status" IN ('Paid', 'Voided'));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_void_whole" CHECK (
  ("status" = 'Paid' AND "void_reason" IS NULL AND "voided_at_date" IS NULL)
  OR ("status" = 'Voided' AND "void_reason" IS NOT NULL AND "voided_at_date" IS NOT NULL)
);
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

-- A shift's rules. Open or Closed; closed means counted, with what the drawer should have held.
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_status_known" CHECK ("status" IN ('Open', 'Closed'));
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_number_from_one" CHECK ("number" >= 1);
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_money_not_negative" CHECK (
  "opening_cash" >= 0 AND ("expected_cash" IS NULL OR "expected_cash" >= 0) AND ("counted_cash" IS NULL OR "counted_cash" >= 0)
);
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_is_counted" CHECK (
  ("status" = 'Open' AND "counted_cash" IS NULL AND "expected_cash" IS NULL AND "closed_at_date" IS NULL)
  OR ("status" = 'Closed' AND "counted_cash" IS NOT NULL AND "expected_cash" IS NOT NULL AND "closed_at_date" IS NOT NULL)
);

-- A shift is never removed, and once closed it never changes: its count is the record of the drawer.
CREATE FUNCTION "shifts_are_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" = 'Open' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'shifts is kept as it was closed: a shift is never removed, and a closed one never changes';
END;
$$;
CREATE TRIGGER "shifts_no_change_once_closed" BEFORE UPDATE OR DELETE ON "shifts"
  FOR EACH ROW EXECUTE FUNCTION "shifts_are_kept"();
CREATE TRIGGER "shifts_no_truncate" BEFORE TRUNCATE ON "shifts"
  FOR EACH STATEMENT EXECUTE FUNCTION "shifts_are_kept"();

-- Stock documents (SCHEMA-PLAN 18–19). Each end is a supplier or a shop: exactly one of each pair.
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_one_source" CHECK (num_nonnulls("source_supplier_id", "source_location_id") = 1);
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_one_destination" CHECK (num_nonnulls("destination_supplier_id", "destination_location_id") = 1);
-- The kind says which ends: from a supplier to a shop, from a shop to a supplier, or shop to shop.
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_kind_matches_ends" CHECK (
  ("kind" = 'from_supplier' AND "source_supplier_id" IS NOT NULL AND "destination_location_id" IS NOT NULL)
  OR ("kind" = 'to_supplier' AND "source_location_id" IS NOT NULL AND "destination_supplier_id" IS NOT NULL)
  OR ("kind" = 'transfer' AND "source_location_id" IS NOT NULL AND "destination_location_id" IS NOT NULL)
);
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_status_known" CHECK ("status" IN ('draft', 'open', 'closed', 'cancelled'));
-- Pieces expected and received are never negative.
ALTER TABLE "stock_document_items" ADD CONSTRAINT "stock_document_items_quantities_not_negative" CHECK (
  "expected_quantity" >= 0 AND "received_quantity" >= 0
);

-- A delivery file that was taken in had zero lines or more.
ALTER TABLE "transfer_imports" ADD CONSTRAINT "transfer_imports_line_count_not_negative" CHECK ("line_count" >= 0);

-- The audit log (SCHEMA-PLAN 11): Beta's two lists, and kept as written, like the stock ledger.
ALTER TABLE "audits" ADD CONSTRAINT "audits_change_type_known" CHECK ("change_type" IN ('Created', 'Updated', 'Decommissioned'));
ALTER TABLE "audits" ADD CONSTRAINT "audits_change_source_known" CHECK ("change_source" IN ('Manual', 'Automatic'));
CREATE FUNCTION "audits_are_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audits is kept as written: a record of a change is never changed or removed';
END;
$$;
CREATE TRIGGER "audits_no_update_or_delete" BEFORE UPDATE OR DELETE ON "audits"
  FOR EACH ROW EXECUTE FUNCTION "audits_are_kept"();
CREATE TRIGGER "audits_no_truncate" BEFORE TRUNCATE ON "audits"
  FOR EACH STATEMENT EXECUTE FUNCTION "audits_are_kept"();
