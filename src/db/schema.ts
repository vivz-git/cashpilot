import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ROLES = ["owner", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const INVOICE_STATUSES = ["open", "paid"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const DISPUTE_STATUSES = ["none", "open", "resolved"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const CUSTOMER_SITUATIONS = [
  "no_response",
  "promised_payment",
  "invoice_not_received",
  "payment_processing",
  "dispute",
  "cash_flow_issue",
  "unknown",
] as const;
export type CustomerSituation = (typeof CUSTOMER_SITUATIONS)[number];

export const TONES = ["friendly", "neutral", "firm"] as const;
export type Tone = (typeof TONES)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const ANALYSIS_SOURCES = ["ai", "fallback"] as const;
export type AnalysisSource = (typeof ANALYSIS_SOURCES)[number];

export const FOLLOW_UP_STATUSES = ["draft", "sending", "sent", "failed", "discarded"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const EMAIL_STATUSES = ["sending", "sent", "failed"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const ACTIVITY_TYPES = [
  "invoice_imported",
  "ai_analyzed",
  "reminder_drafted",
  "reminder_edited",
  "reminder_sent",
  "reminder_failed",
  "customer_replied",
  "payment_promised",
  "payment_received",
  "dispute_created",
  "dispute_resolved",
  "no_response",
  "note_added",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Where an activity came from. `email_inbound` is reserved for future reply ingestion. */
export const ACTIVITY_SOURCES = ["system", "manual", "email_inbound"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    index("users_org_idx").on(t.organizationId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 hash of the session token. The raw token only exists in the user's cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    rowCount: integer("row_count").notNull(),
    importedCount: integer("imported_count").notNull(),
    skippedCount: integer("skipped_count").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("imports_org_idx").on(t.organizationId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
    invoiceNumber: text("invoice_number").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    /** Amount in the currency's minor unit (e.g. cents). */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    accountManager: text("account_manager"),
    notes: text("notes"),

    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("open"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    disputeStatus: text("dispute_status", { enum: DISPUTE_STATUSES }).notNull().default("none"),
    disputeReason: text("dispute_reason"),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    nextFollowUpDate: date("next_follow_up_date"),
    followUpCount: integer("follow_up_count").notNull().default(0),
    promiseToPayDate: date("promise_to_pay_date"),

    /** Denormalised copy of the latest analysis, for fast dashboard sorting. */
    aiPriority: integer("ai_priority"),
    aiReason: text("ai_reason"),
    aiRecommendedAction: text("ai_recommended_action"),
    aiSituation: text("ai_situation", { enum: CUSTOMER_SITUATIONS }),
    aiConfidence: text("ai_confidence", { enum: CONFIDENCE_LEVELS }),
    aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),

    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_org_number_unique").on(t.organizationId, sql`lower(${t.invoiceNumber})`),
    index("invoices_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const invoiceAnalyses = pgTable(
  "invoice_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    priorityScore: integer("priority_score").notNull(),
    reason: text("reason").notNull(),
    customerSituation: text("customer_situation", { enum: CUSTOMER_SITUATIONS }).notNull(),
    recommendedAction: text("recommended_action").notNull(),
    recommendedTone: text("recommended_tone", { enum: TONES }).notNull(),
    confidence: text("confidence", { enum: CONFIDENCE_LEVELS }).notNull(),
    missingInformation: jsonb("missing_information").$type<string[]>().notNull(),
    evidence: jsonb("evidence").$type<string[]>().notNull(),
    /** Notes from server-side guardrails that changed the model's answer. */
    guardNotes: jsonb("guard_notes").$type<string[]>().notNull(),
    source: text("source", { enum: ANALYSIS_SOURCES }).notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("analyses_invoice_idx").on(t.organizationId, t.invoiceId)],
);

export const followUps = pgTable(
  "follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: FOLLOW_UP_STATUSES }).notNull().default("draft"),
    /** `ai` when the model's draft passed safety checks, otherwise `template`. */
    source: text("source").notNull(),
    edited: boolean("edited").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("follow_ups_invoice_idx").on(t.organizationId, t.invoiceId)],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    followUpId: uuid("follow_up_id")
      .notNull()
      .references(() => followUps.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: EMAIL_STATUSES }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("email_messages_invoice_idx").on(t.organizationId, t.invoiceId),
    // At most one successful email per follow-up draft (duplicate-send backstop).
    uniqueIndex("email_messages_follow_up_sent_unique")
      .on(t.followUpId)
      .where(sql`${t.status} = 'sent'`),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull(),
    source: text("source", { enum: ACTIVITY_SOURCES }).notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activities_invoice_idx").on(t.organizationId, t.invoiceId, t.createdAt)],
);

/** Append-only log of security-relevant and external actions (email sends, AI calls, logins). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_org_idx").on(t.organizationId, t.createdAt)],
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceAnalysis = typeof invoiceAnalyses.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type Activity = typeof activities.$inferSelect;
