-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ABSENT', 'DISMISSED');

-- CreateEnum
CREATE TYPE "EmployeeChangeType" AS ENUM ('HIRE', 'TRANSFER', 'UPDATE', 'STATUS_CHANGE', 'DISMISSAL', 'REHIRE', 'IMPORT_CREATE', 'IMPORT_UPDATE');

-- CreateEnum
CREATE TYPE "SafetyDocumentType" AS ENUM ('INSTRUCTION', 'PROGRAM', 'ORDER', 'REGULATION', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PLANNED', 'CONDUCTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantResult" AS ENUM ('PENDING', 'COMPLETED', 'NOT_COMPLETED', 'ABSENT');

-- CreateEnum
CREATE TYPE "ConfirmationMethod" AS ENUM ('PAPER_JOURNAL_SIGNATURE', 'SCANNED_DOCUMENT', 'ELECTRONIC', 'OTHER');

-- CreateEnum
CREATE TYPE "CommissionRole" AS ENUM ('CHAIR', 'DEPUTY', 'MEMBER', 'SECRETARY');

-- CreateEnum
CREATE TYPE "CheckOutcome" AS ENUM ('PASSED', 'FAILED', 'ABSENT');

-- CreateEnum
CREATE TYPE "PpeSizeType" AS ENUM ('NONE', 'CLOTHING', 'SHOES', 'HEAD', 'HANDS', 'RESPIRATORY', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PpeIssueStatus" AS ENUM ('ACTIVE', 'PARTIALLY_CLOSED', 'RETURNED', 'WRITTEN_OFF', 'REPLACED');

-- CreateEnum
CREATE TYPE "PpeReturnType" AS ENUM ('RETURN', 'WRITE_OFF', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'RETURN', 'WRITE_OFF', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('MANUAL', 'CONTROL_EVENT', 'AUTO_BRIEFING', 'AUTO_CHECK', 'AUTO_PPE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('BRIEFING_PLANNED', 'KNOWLEDGE_CHECK_PLANNED', 'PPE_REPLACEMENT', 'TASK_DUE', 'BRIEFING_COMPLIANCE_DIGEST', 'CHECK_COMPLIANCE_DIGEST');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('EMPLOYEES', 'PPE_ITEMS', 'PPE_STANDARDS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "all_units" BOOLEAN NOT NULL DEFAULT false,
    "employee_id" UUID,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "user_unit_scopes" (
    "user_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,

    CONSTRAINT "user_unit_scopes_pkey" PRIMARY KEY ("user_id","unit_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by" UUID,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizational_units" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizational_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "work_category" TEXT,
    "is_profession" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "personnel_number" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "unit_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "hire_date" DATE NOT NULL,
    "dismissal_date" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "manager_id" UUID,
    "phone" TEXT,
    "email" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "change_type" "EmployeeChangeType" NOT NULL,
    "effective_date" DATE NOT NULL,
    "from_unit_id" UUID,
    "to_unit_id" UUID,
    "from_position_id" UUID,
    "to_position_id" UUID,
    "changes" JSONB,
    "reason" TEXT,
    "order_number" TEXT,
    "author_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_documents" (
    "id" UUID NOT NULL,
    "doc_type" "SafetyDocumentType" NOT NULL DEFAULT 'INSTRUCTION',
    "number" TEXT,
    "title" TEXT NOT NULL,
    "version" TEXT,
    "approved_date" DATE,
    "valid_from" DATE,
    "valid_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "safety_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "briefing_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_periodic" BOOLEAN NOT NULL DEFAULT false,
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "briefing_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "briefing_rules" (
    "id" UUID NOT NULL,
    "briefing_type_id" UUID NOT NULL,
    "position_id" UUID,
    "work_category" TEXT,
    "unit_id" UUID,
    "period_months" INTEGER,
    "period_days" INTEGER,
    "initial_due_days" INTEGER,
    "reset_on_transfer" BOOLEAN NOT NULL DEFAULT false,
    "basis" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "briefing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "briefings" (
    "id" UUID NOT NULL,
    "briefing_type_id" UUID NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_date" DATE,
    "conducted_date" DATE,
    "topic" TEXT,
    "reason" TEXT,
    "document_id" UUID,
    "responsible_employee_id" UUID,
    "note" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "briefings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "briefing_participants" (
    "id" UUID NOT NULL,
    "briefing_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "result" "ParticipantResult" NOT NULL DEFAULT 'PENDING',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmation_method" "ConfirmationMethod",
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_id" UUID,
    "confirmation_note" TEXT,
    "next_due_date" DATE,
    "next_due_rule_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "briefing_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_check_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_check_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_check_rules" (
    "id" UUID NOT NULL,
    "check_type_id" UUID NOT NULL,
    "position_id" UUID,
    "work_category" TEXT,
    "unit_id" UUID,
    "period_months" INTEGER,
    "period_days" INTEGER,
    "initial_due_days" INTEGER,
    "reset_on_transfer" BOOLEAN NOT NULL DEFAULT false,
    "retest_days" INTEGER,
    "basis" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_check_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order_number" TEXT,
    "order_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_members" (
    "id" UUID NOT NULL,
    "commission_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" "CommissionRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "commission_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_checks" (
    "id" UUID NOT NULL,
    "check_type_id" UUID NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
    "reason" TEXT,
    "planned_date" DATE,
    "conducted_date" DATE,
    "commission_id" UUID,
    "responsible_employee_id" UUID,
    "protocol_number" TEXT,
    "protocol_date" DATE,
    "note" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "knowledge_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_check_participants" (
    "id" UUID NOT NULL,
    "check_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_check_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_check_results" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "outcome" "CheckOutcome" NOT NULL,
    "score" TEXT,
    "next_check_date" DATE,
    "next_check_rule_id" UUID,
    "next_check_manual" BOOLEAN NOT NULL DEFAULT false,
    "next_check_basis" TEXT,
    "comment" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_check_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppe_items" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "model" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'шт.',
    "size_type" "PpeSizeType" NOT NULL DEFAULT 'NONE',
    "characteristics" TEXT,
    "default_wear_months" INTEGER,
    "basis" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ppe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppe_standards" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "ppe_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'шт.',
    "wear_months" INTEGER,
    "wear_condition" TEXT,
    "basis" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ppe_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppe_issues" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "ppe_item_id" UUID NOT NULL,
    "standard_id" UUID,
    "unit_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "issue_date" DATE NOT NULL,
    "size" TEXT,
    "wear_months" INTEGER,
    "planned_replacement_date" DATE,
    "replacement_manual" BOOLEAN NOT NULL DEFAULT false,
    "replacement_basis" TEXT,
    "issued_by_id" UUID,
    "issuer_name" TEXT,
    "receipt_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "receipt_confirmed_at" TIMESTAMPTZ(3),
    "receipt_confirmed_by_id" UUID,
    "receipt_method" "ConfirmationMethod",
    "basis" TEXT,
    "note" TEXT,
    "status" "PpeIssueStatus" NOT NULL DEFAULT 'ACTIVE',
    "replaces_issue_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ppe_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppe_returns" (
    "id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "operation_type" "PpeReturnType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "operation_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "to_stock" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppe_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppe_stock_movements" (
    "id" UUID NOT NULL,
    "ppe_item_id" UUID NOT NULL,
    "size" TEXT,
    "quantity" INTEGER NOT NULL,
    "movement_type" "StockMovementType" NOT NULL,
    "movement_date" DATE NOT NULL,
    "issue_id" UUID,
    "return_id" UUID,
    "document" TEXT,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppe_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "task_type" "TaskType" NOT NULL DEFAULT 'MANUAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "due_date" DATE,
    "assignee_user_id" UUID,
    "unit_id" UUID,
    "entity_type" TEXT,
    "entity_id" UUID,
    "source_key" TEXT,
    "result" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" UUID NOT NULL,
    "event_type" "NotificationEventType" NOT NULL,
    "name" TEXT NOT NULL,
    "days_before" INTEGER[],
    "notify_on_due_date" BOOLEAN NOT NULL DEFAULT true,
    "notify_overdue" BOOLEAN NOT NULL DEFAULT true,
    "notify_responsible" BOOLEAN NOT NULL DEFAULT true,
    "notify_unit_heads" BOOLEAN NOT NULL DEFAULT true,
    "notify_safety_specialists" BOOLEAN NOT NULL DEFAULT true,
    "create_task_on_overdue" BOOLEAN NOT NULL DEFAULT false,
    "channels" TEXT[] DEFAULT ARRAY['IN_APP']::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" "NotificationEventType",
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "description" TEXT,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" TEXT,
    "verified_at" TIMESTAMPTZ(3),
    "basis" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "user_login" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "method" TEXT,
    "path" TEXT,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "import_type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "file_name" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "options" JSONB,
    "message" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "field" TEXT,
    "value" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizational_units_code_key" ON "organizational_units"("code");

-- CreateIndex
CREATE INDEX "organizational_units_parent_id_idx" ON "organizational_units"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_key" ON "positions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_personnel_number_key" ON "employees"("personnel_number");

-- CreateIndex
CREATE INDEX "employees_unit_id_idx" ON "employees"("unit_id");

-- CreateIndex
CREATE INDEX "employees_position_id_idx" ON "employees"("position_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_last_name_first_name_idx" ON "employees"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "employee_history_employee_id_effective_date_idx" ON "employee_history"("employee_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "briefing_types_code_key" ON "briefing_types"("code");

-- CreateIndex
CREATE INDEX "briefing_rules_briefing_type_id_idx" ON "briefing_rules"("briefing_type_id");

-- CreateIndex
CREATE INDEX "briefings_status_planned_date_idx" ON "briefings"("status", "planned_date");

-- CreateIndex
CREATE INDEX "briefings_conducted_date_idx" ON "briefings"("conducted_date");

-- CreateIndex
CREATE INDEX "briefings_briefing_type_id_idx" ON "briefings"("briefing_type_id");

-- CreateIndex
CREATE INDEX "briefing_participants_employee_id_idx" ON "briefing_participants"("employee_id");

-- CreateIndex
CREATE INDEX "briefing_participants_unit_id_idx" ON "briefing_participants"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "briefing_participants_briefing_id_employee_id_key" ON "briefing_participants"("briefing_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_check_types_code_key" ON "knowledge_check_types"("code");

-- CreateIndex
CREATE INDEX "knowledge_check_rules_check_type_id_idx" ON "knowledge_check_rules"("check_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_members_commission_id_employee_id_key" ON "commission_members"("commission_id", "employee_id");

-- CreateIndex
CREATE INDEX "knowledge_checks_status_planned_date_idx" ON "knowledge_checks"("status", "planned_date");

-- CreateIndex
CREATE INDEX "knowledge_checks_conducted_date_idx" ON "knowledge_checks"("conducted_date");

-- CreateIndex
CREATE INDEX "knowledge_check_participants_employee_id_idx" ON "knowledge_check_participants"("employee_id");

-- CreateIndex
CREATE INDEX "knowledge_check_participants_unit_id_idx" ON "knowledge_check_participants"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_check_participants_check_id_employee_id_key" ON "knowledge_check_participants"("check_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_check_results_participant_id_key" ON "knowledge_check_results"("participant_id");

-- CreateIndex
CREATE INDEX "knowledge_check_results_outcome_idx" ON "knowledge_check_results"("outcome");

-- CreateIndex
CREATE INDEX "knowledge_check_results_next_check_date_idx" ON "knowledge_check_results"("next_check_date");

-- CreateIndex
CREATE UNIQUE INDEX "ppe_items_code_key" ON "ppe_items"("code");

-- CreateIndex
CREATE INDEX "ppe_items_name_idx" ON "ppe_items"("name");

-- CreateIndex
CREATE INDEX "ppe_standards_position_id_idx" ON "ppe_standards"("position_id");

-- CreateIndex
CREATE INDEX "ppe_standards_ppe_item_id_idx" ON "ppe_standards"("ppe_item_id");

-- CreateIndex
CREATE INDEX "ppe_issues_employee_id_idx" ON "ppe_issues"("employee_id");

-- CreateIndex
CREATE INDEX "ppe_issues_ppe_item_id_idx" ON "ppe_issues"("ppe_item_id");

-- CreateIndex
CREATE INDEX "ppe_issues_status_planned_replacement_date_idx" ON "ppe_issues"("status", "planned_replacement_date");

-- CreateIndex
CREATE INDEX "ppe_returns_issue_id_idx" ON "ppe_returns"("issue_id");

-- CreateIndex
CREATE INDEX "ppe_stock_movements_ppe_item_id_size_idx" ON "ppe_stock_movements"("ppe_item_id", "size");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_source_key_key" ON "tasks"("source_key");

-- CreateIndex
CREATE INDEX "tasks_status_due_date_idx" ON "tasks"("status", "due_date");

-- CreateIndex
CREATE INDEX "tasks_assignee_user_id_idx" ON "tasks"("assignee_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_rules_event_type_key" ON "notification_rules"("event_type");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_stored_name_key" ON "attachments"("stored_name");

-- CreateIndex
CREATE INDEX "attachments_entity_type_entity_id_idx" ON "attachments"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_code_version_key" ON "document_templates"("code", "version");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "import_errors_job_id_idx" ON "import_errors"("job_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_unit_scopes" ADD CONSTRAINT "user_unit_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_unit_scopes" ADD CONSTRAINT "user_unit_scopes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizational_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizational_units" ADD CONSTRAINT "organizational_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_history" ADD CONSTRAINT "employee_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefing_rules" ADD CONSTRAINT "briefing_rules_briefing_type_id_fkey" FOREIGN KEY ("briefing_type_id") REFERENCES "briefing_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_briefing_type_id_fkey" FOREIGN KEY ("briefing_type_id") REFERENCES "briefing_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "safety_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_responsible_employee_id_fkey" FOREIGN KEY ("responsible_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefing_participants" ADD CONSTRAINT "briefing_participants_briefing_id_fkey" FOREIGN KEY ("briefing_id") REFERENCES "briefings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefing_participants" ADD CONSTRAINT "briefing_participants_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_check_rules" ADD CONSTRAINT "knowledge_check_rules_check_type_id_fkey" FOREIGN KEY ("check_type_id") REFERENCES "knowledge_check_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_members" ADD CONSTRAINT "commission_members_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "commissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_members" ADD CONSTRAINT "commission_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_checks" ADD CONSTRAINT "knowledge_checks_check_type_id_fkey" FOREIGN KEY ("check_type_id") REFERENCES "knowledge_check_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_checks" ADD CONSTRAINT "knowledge_checks_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_checks" ADD CONSTRAINT "knowledge_checks_responsible_employee_id_fkey" FOREIGN KEY ("responsible_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_check_participants" ADD CONSTRAINT "knowledge_check_participants_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "knowledge_checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_check_participants" ADD CONSTRAINT "knowledge_check_participants_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_check_results" ADD CONSTRAINT "knowledge_check_results_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "knowledge_check_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppe_standards" ADD CONSTRAINT "ppe_standards_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppe_standards" ADD CONSTRAINT "ppe_standards_ppe_item_id_fkey" FOREIGN KEY ("ppe_item_id") REFERENCES "ppe_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppe_issues" ADD CONSTRAINT "ppe_issues_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppe_issues" ADD CONSTRAINT "ppe_issues_ppe_item_id_fkey" FOREIGN KEY ("ppe_item_id") REFERENCES "ppe_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppe_issues" ADD CONSTRAINT "ppe_issues_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "ppe_standards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppe_returns" ADD CONSTRAINT "ppe_returns_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "ppe_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppe_stock_movements" ADD CONSTRAINT "ppe_stock_movements_ppe_item_id_fkey" FOREIGN KEY ("ppe_item_id") REFERENCES "ppe_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
