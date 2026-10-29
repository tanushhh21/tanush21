/**
 * The console's data model. Postgres (Neon in production, PGlite locally).
 *
 * Everything a customer owns carries `orgId`. "Role" means a job opening;
 * a person's permission level in an org is their `access`.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---- Auth (shapes required by Auth.js) ------------------------------------

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  /** Winnow's own staff: every customer, plus the operator console. */
  isOperator: boolean("is_operator").notNull().default(false),
  /** scrypt, never the password itself. Null for people who only use Google or email links. */
  passwordHash: text("password_hash"),
  passwordSetAt: ts("password_set_at"),
  /** Sessions signed in before this moment are no longer valid (password changed, "sign out everywhere"). */
  sessionsValidFrom: ts("sessions_valid_from"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  createdAt: created(),
});

/**
 * Short codes sent by email: confirming an address, resetting a password,
 * and one-time tickets that sign someone in right after. Only a keyed hash is
 * stored, and each code dies after a few wrong tries or 15 minutes.
 */
export const emailCodes = pgTable(
  "email_code",
  {
    id: id(),
    email: text("email").notNull(),
    purpose: text("purpose").$type<"verify" | "reset" | "ticket">().notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("email_code_email").on(t.email, t.purpose)],
);

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<"oauth" | "oidc" | "email" | "webauthn">().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---- Organisations and people who use the console --------------------------

export type Access = "hiring_manager" | "ta" | "admin";

export type CompBand = { level: string; min: number; max: number };

export const orgs = pgTable("org", {
  id: id(),
  name: text("name").notNull(),
  domain: text("domain"),
  careersEmail: text("careers_email"),
  logoUrl: text("logo_url"),
  locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
  levelLadder: jsonb("level_ladder").$type<string[]>().notNull().default([]),
  compBands: jsonb("comp_bands").$type<CompBand[]>().notNull().default([]),
  /** Who candidate questions come from by default: the company's careers address, or Winnow. */
  questionSender: text("question_sender").$type<"company" | "winnow">().notNull().default("winnow"),
  /** Days to keep each record type; null means the default. */
  retention: jsonb("retention").$type<Record<string, number>>().notNull().default({}),
  /** Days a candidate can wait at a stage before it shows in needs-you. */
  staleDays: integer("stale_days").notNull().default(5),
  slackWebhook: text("slack_webhook"),
  /** Whether anonymised outcomes may improve Winnow for everyone; off unless the company opts in. */
  shareWithWinnow: boolean("share_with_winnow").notNull().default(false),
  plan: text("plan").$type<"pilot" | "growth" | "enterprise">().notNull().default("pilot"),
  /** The made-up company operators show the console with (lib/console/demo.ts). Only that code sets it. */
  demo: boolean("demo").notNull().default(false),
  createdAt: created(),
});

export const memberships = pgTable(
  "membership",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    access: text("access").$type<Access>().notNull(),
    /** A hiring manager limited to named roles (see roleAccess). */
    restricted: boolean("restricted").notNull().default(false),
    deactivatedAt: ts("deactivated_at"),
    /** The last time they opened the console, and where their current "while you were away" starts. */
    seenAt: ts("seen_at"),
    awayFrom: ts("away_from"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("membership_org_user").on(t.orgId, t.userId)],
);

export const invites = pgTable("invite", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  access: text("access").$type<Access>().notNull(),
  roleIds: uuid("role_ids").array().notNull().default(sql`'{}'::uuid[]`),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by").references(() => users.id),
  acceptedAt: ts("accepted_at"),
  expiresAt: ts("expires_at").notNull(),
  createdAt: created(),
});

// ---- Roles (job openings) ---------------------------------------------------

export type RoleState = "open" | "on_hold" | "closed";
export type CloseReason = "filled" | "cancelled" | "on_hold";
export type SourceKind = "upload" | "ats" | "careers_inbox" | "referral" | "winnow_sourcing" | "talent_pool";

export const roles = pgTable(
  "role",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    family: text("family"),
    locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
    openings: integer("openings").notNull().default(1),
    targetDate: date("target_date", { mode: "string" }),
    compMin: integer("comp_min"),
    compMax: integer("comp_max"),
    compShareable: boolean("comp_shareable").notNull().default(false),
    hiringManagerId: text("hiring_manager_id").references(() => users.id),
    /** "team": the TA team plus the hiring manager. "restricted": only roleAccess. */
    visibility: text("visibility").$type<"team" | "restricted">().notNull().default("team"),
    questionSender: text("question_sender").$type<"company" | "winnow">(),
    sources: text("sources").array().$type<SourceKind[]>().notNull().default(sql`'{}'::text[]`),
    jdText: text("jd_text"),
    intakeNotes: text("intake_notes"),
    fromRoleId: uuid("from_role_id"),
    state: text("state").$type<RoleState>().notNull().default("open"),
    closeReason: text("close_reason").$type<CloseReason>(),
    /** Who was hired: the most valuable fact the system can learn, asked for on close. */
    hiredApplicationId: uuid("hired_application_id"),
    rubricVersion: integer("rubric_version").notNull().default(0),
    rubricReviewedAt: ts("rubric_reviewed_at"),
    lastChangeAt: ts("last_change_at").notNull().defaultNow(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: created(),
    closedAt: ts("closed_at"),
  },
  (t) => [index("role_org").on(t.orgId)],
);

export const roleAccess = pgTable(
  "role_access",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.userId] })],
);

export const roleSources = pgTable("role_source", {
  id: id(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  kind: text("kind").$type<SourceKind>().notNull(),
  label: text("label").notNull(),
  /** What this source cost, in rupees (job board fees, sourcing time). */
  costInr: integer("cost_inr").notNull().default(0),
  lastRunAt: ts("last_run_at"),
  createdAt: created(),
});

// ---- Rubric (versioned) ------------------------------------------------------

export type ReqOrigin = "jd" | "chat" | "winnow" | "fitted" | "manual";

export const rubricVersions = pgTable(
  "rubric_version",
  {
    id: id(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    origin: text("origin").$type<"initial" | "edit" | "chat" | "restore" | "fitted">().notNull(),
    summary: text("summary").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: created(),
  },
  (t) => [uniqueIndex("rubric_role_version").on(t.roleId, t.version)],
);

export const requirements = pgTable(
  "requirement",
  {
    id: id(),
    rubricVersionId: uuid("rubric_version_id")
      .notNull()
      .references(() => rubricVersions.id, { onDelete: "cascade" }),
    /** Stable across versions, so a requirement can be followed through edits. */
    key: text("key").notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    weight: integer("weight").notNull(),
    mustHave: boolean("must_have").notNull().default(false),
    sourceSentence: text("source_sentence"),
    origin: text("origin").$type<ReqOrigin>().notNull(),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    minYears: integer("min_years"),
    recencySensitive: boolean("recency_sensitive").notNull().default(false),
  },
  (t) => [index("requirement_version").on(t.rubricVersionId)],
);

export const refusedCriteria = pgTable("refused_criterion", {
  id: id(),
  rubricVersionId: uuid("rubric_version_id")
    .notNull()
    .references(() => rubricVersions.id, { onDelete: "cascade" }),
  line: text("line").notNull(),
  reason: text("reason").notNull(),
  /** protected: never encoded, ask about the underlying need. unwise: legal, can be added with a bias flag. */
  kind: text("kind").$type<"protected" | "unwise">().notNull(),
  addedAnyway: boolean("added_anyway").notNull().default(false),
  addedBy: text("added_by").references(() => users.id),
  addedAt: ts("added_at"),
});

export const hardFilters = pgTable("hard_filter", {
  id: id(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  op: text("op").$type<"eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "contains">().notNull(),
  value: jsonb("value").$type<string | number | string[]>().notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").references(() => users.id),
  createdAt: created(),
});

// ---- People: the person graph and the talent pool --------------------------

export const persons = pgTable(
  "person",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    links: jsonb("links").$type<string[]>().notNull().default([]),
    /** Set when this record was merged into another. */
    mergedInto: uuid("merged_into"),
    consent: text("consent").$type<"unknown" | "given" | "withdrawn">().notNull().default("unknown"),
    consentAt: ts("consent_at"),
    retainUntil: date("retain_until", { mode: "string" }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: created(),
  },
  (t) => [index("person_org").on(t.orgId), index("person_email").on(t.orgId, t.email)],
);

export const personIdentities = pgTable(
  "person_identity",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"email" | "phone" | "link" | "name_company">().notNull(),
    value: text("value").notNull(),
    confidence: real("confidence").notNull().default(1),
  },
  (t) => [index("identity_value").on(t.kind, t.value)],
);

/** Possible duplicates the system was not sure enough to merge on its own. */
export const mergeCandidates = pgTable("merge_candidate", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  personA: uuid("person_a")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" }),
  personB: uuid("person_b")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" }),
  confidence: real("confidence").notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<"open" | "merged" | "distinct">().notNull().default("open"),
  createdAt: created(),
});

export const talentPools = pgTable("talent_pool", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: created(),
});

export const talentPoolMembers = pgTable(
  "talent_pool_member",
  {
    poolId: uuid("pool_id")
      .notNull()
      .references(() => talentPools.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    addedBy: text("added_by").references(() => users.id),
    addedAt: created(),
  },
  (t) => [primaryKey({ columns: [t.poolId, t.personId] })],
);

// ---- Applications and what was read off them --------------------------------

export type Stage = "new" | "screening" | "shortlisted" | "interviewing" | "offer" | "hired" | "dropped" | "on_hold";
export type Decision = "none" | "shortlisted" | "dropped" | "held";

export const applications = pgTable(
  "application",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    source: text("source").$type<SourceKind>().notNull(),
    sourceId: uuid("source_id"),
    referredBy: text("referred_by"),
    appliedAt: ts("applied_at").notNull().defaultNow(),
    stage: text("stage").$type<Stage>().notNull().default("new"),
    stageChangedAt: ts("stage_changed_at").notNull().defaultNow(),
    decision: text("decision").$type<Decision>().notNull().default("none"),
    reasonCode: text("reason_code"),
    decisionNote: text("decision_note"),
    decidedBy: text("decided_by").references(() => users.id),
    decidedAt: ts("decided_at"),
    /** After hired (offer accepted): the day they joined, which is when the hire really counts. */
    acceptedAt: ts("accepted_at"),
    joinedAt: ts("joined_at"),
    /**
     * Protected attributes the CV stated outright (never inferred), kept apart
     * from everything the scorer sees and used only for the fairness check.
     */
    protectedAttrs: jsonb("protected").$type<{ gender?: string | null; birthYear?: number | null }>().notNull().default({}),
    /** When the hiring manager first opened this candidate. */
    managerSeenAt: ts("manager_seen_at"),
    parseStatus: text("parse_status").$type<"pending" | "parsed" | "unreadable">().notNull().default("pending"),
    parseError: text("parse_error"),
    interest: text("interest").$type<"unknown" | "interested" | "not_interested">().notNull().default("unknown"),
    lastReplyAt: ts("last_reply_at"),
    replyReadAt: ts("reply_read_at"),
    createdAt: created(),
  },
  (t) => [index("application_role").on(t.roleId), index("application_person").on(t.personId), index("application_org").on(t.orgId)],
);

export const documents = pgTable(
  "document",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"cv" | "jd" | "intake" | "work_sample" | "answer" | "other">().notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    url: text("url"),
    text: text("text"),
    parseStatus: text("parse_status").$type<"pending" | "parsed" | "unreadable">().notNull().default("pending"),
    parseError: text("parse_error"),
    /** Spans that revealed excluded attributes; removed before scoring, named on the candidate page. */
    excluded: text("excluded").array().notNull().default(sql`'{}'::text[]`),
    createdAt: created(),
  },
  (t) => [index("document_application").on(t.applicationId)],
);

/** Fields read off an application. Excluded attributes are stored and shown, never scored. */
export const applicationFacts = pgTable(
  "application_fact",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    value: text("value").notNull(),
    num: numeric("num", { mode: "number" }),
    stated: boolean("stated").notNull(),
    quote: text("quote"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  },
  (t) => [index("fact_application").on(t.applicationId), uniqueIndex("fact_application_field").on(t.applicationId, t.field)],
);

// ---- Evaluation --------------------------------------------------------------

export type Band = "verified" | "needs_verification" | "below_bar";
export type VerdictValue = "met" | "partial" | "not_met" | "unknown";
export type Support = "verified" | "supported" | "self_reported";

export const evaluations = pgTable(
  "evaluation",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    rubricVersion: integer("rubric_version").notNull(),
    status: text("status").$type<"pending" | "scoring" | "done" | "failed">().notNull().default("pending"),
    error: text("error"),
    score: real("score"),
    confidence: real("confidence"),
    band: text("band").$type<Band>(),
    rank: integer("rank"),
    percentile: integer("percentile"),
    /** The two-line reason: the strongest evidence, and the sharpest gap. */
    reasonStrength: text("reason_strength"),
    reasonGap: text("reason_gap"),
    mustHavesMet: integer("must_haves_met"),
    mustHavesTotal: integer("must_haves_total"),
    evidenceStrength: text("evidence_strength").$type<"strong" | "moderate" | "weak">(),
    pointsEarned: real("points_earned"),
    pointsAvailable: real("points_available"),
    filteredOut: boolean("filtered_out").notNull().default(false),
    /** Questions the evaluation suggests for the gaps; drafted for sending only when someone chooses to. */
    suggestions: jsonb("suggestions").$type<{ requirementKey: string | null; text: string }[]>().notNull().default([]),
    costUsd: numeric("cost_usd", { mode: "number" }).notNull().default(0),
    model: text("model"),
    createdAt: created(),
    scoredAt: ts("scored_at"),
  },
  (t) => [
    uniqueIndex("evaluation_application_version").on(t.applicationId, t.rubricVersion),
    index("evaluation_role_version").on(t.roleId, t.rubricVersion),
  ],
);

export const verdicts = pgTable(
  "verdict",
  {
    id: id(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    requirementKey: text("requirement_key").notNull(),
    verdict: text("verdict").$type<VerdictValue>().notNull(),
    quote: text("quote"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    position: integer("position"),
    retrievedAt: ts("retrieved_at"),
    support: text("support").$type<Support>(),
    contribution: real("contribution").notNull().default(0),
    rationale: text("rationale"),
  },
  (t) => [index("verdict_evaluation").on(t.evaluationId)],
);

export const contradictions = pgTable(
  "contradiction",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"dates" | "title" | "employer" | "education" | "skills" | "other">().notNull(),
    quoteA: text("quote_a").notNull(),
    sourceA: text("source_a").notNull(),
    quoteB: text("quote_b").notNull(),
    sourceB: text("source_b").notNull(),
    readAt: ts("read_at"),
    resolvedBy: text("resolved_by").references(() => users.id),
    resolvedAt: ts("resolved_at"),
    resolution: text("resolution"),
    createdAt: created(),
  },
  (t) => [index("contradiction_application").on(t.applicationId)],
);

/** Pairwise choices from Compare: "which would you interview first?" */
export const calibrations = pgTable("calibration", {
  id: id(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  chosenId: uuid("chosen_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  otherId: uuid("other_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id),
  createdAt: created(),
});

// ---- Verification: questions to candidates ------------------------------------

export const questions = pgTable(
  "question",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"question" | "work_sample" | "reference">().notNull().default("question"),
    requirementKey: text("requirement_key"),
    text: text("text").notNull(),
    status: text("status")
      .$type<"drafted" | "sent" | "answered" | "unanswered" | "asked_outside" | "skipped">()
      .notNull()
      .default("drafted"),
    skipReason: text("skip_reason"),
    /** Sends grouped together share a batch: one email per candidate. */
    batchId: uuid("batch_id"),
    token: text("token"),
    sentAt: ts("sent_at"),
    followups: integer("followups").notNull().default(0),
    lastFollowupAt: ts("last_followup_at"),
    answer: text("answer"),
    answeredAt: ts("answered_at"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: created(),
  },
  (t) => [index("question_application").on(t.applicationId), index("question_token").on(t.token)],
);

// ---- Observations: everything people learn, with a kind discriminator --------

export type ObservationKind =
  | "decision"
  | "debrief"
  | "note"
  | "answer"
  | "verification"
  | "contradiction_resolution"
  | "calibration"
  | "interest"
  | "outcome"
  | "brain_correction"
  | "cut_line";

export const observations = pgTable(
  "observation",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ObservationKind>().notNull(),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").references(() => users.id),
    createdAt: created(),
  },
  (t) => [index("observation_person").on(t.personId), index("observation_application").on(t.applicationId)],
);

export const notes = pgTable("note", {
  id: id(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id),
  body: text("body").notNull(),
  mentions: text("mentions").array().notNull().default(sql`'{}'::text[]`),
  createdAt: created(),
});

/** Every message to or from a candidate, in order. */
export const messages = pgTable(
  "message",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"out" | "in">().notNull(),
    channel: text("channel").$type<"email" | "reply_page" | "outside">().notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    fromAddress: text("from_address"),
    sentBy: text("sent_by").references(() => users.id),
    createdAt: created(),
  },
  (t) => [index("message_application").on(t.applicationId)],
);

// ---- Company brain -----------------------------------------------------------

export type FactGroup =
  | "what_you_build"
  | "stage_scale"
  | "stack"
  | "team"
  | "operating_reality"
  | "compensation"
  | "locations"
  | "past_hires"
  | "vocabulary";

export const companyFacts = pgTable(
  "company_fact",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    group: text("group").$type<FactGroup>().notNull(),
    /** Stable for beliefs Winnow infers, so re-inferring updates them instead of duplicating. */
    key: text("key"),
    text: text("text").notNull(),
    provenance: text("provenance").$type<"told" | "ats" | "inferred">().notNull(),
    confidence: real("confidence").notNull().default(1),
    evidence: text("evidence"),
    active: boolean("active").notNull().default(true),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: created(),
  },
  (t) => [uniqueIndex("company_fact_key").on(t.orgId, t.key)],
);

// ---- Interviews --------------------------------------------------------------

export type Slot = { start: string; end: string };

export const availabilityLinks = pgTable("availability_link", {
  id: id(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  interviewerId: text("interviewer_id").references(() => users.id),
  slots: jsonb("slots").$type<Slot[]>().notNull(),
  minutes: integer("minutes").notNull().default(45),
  token: text("token").notNull().unique(),
  status: text("status").$type<"sent" | "booked" | "expired">().notNull().default("sent"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: created(),
});

export const interviews = pgTable(
  "interview",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    interviewerId: text("interviewer_id").references(() => users.id),
    title: text("title").notNull().default("Interview"),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    status: text("status").$type<"scheduled" | "done" | "rescheduled" | "no_show" | "cancelled">().notNull().default("scheduled"),
    reschedules: integer("reschedules").notNull().default(0),
    linkId: uuid("link_id"),
    createdAt: created(),
  },
  (t) => [index("interview_role").on(t.roleId)],
);

export const debriefs = pgTable("debrief", {
  id: id(),
  interviewId: uuid("interview_id")
    .notNull()
    .references(() => interviews.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id),
  wouldHire: text("would_hire").$type<"strong_yes" | "yes" | "no" | "strong_no">().notNull(),
  strongest: text("strongest"),
  concern: text("concern"),
  createdAt: created(),
});

// ---- Activity, audit, needs-you, views ---------------------------------------

export const activity = pgTable(
  "activity",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    costUsd: numeric("cost_usd", { mode: "number" }).notNull().default(0),
    /** Null when Winnow did it. */
    actorId: text("actor_id").references(() => users.id),
    createdAt: created(),
  },
  (t) => [index("activity_org_time").on(t.orgId, t.createdAt), index("activity_role").on(t.roleId)],
);

/** Append-only. Updates and deletes are refused by a trigger (see the migration). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    roleId: uuid("role_id"),
    applicationId: uuid("application_id"),
    rubricVersion: integer("rubric_version"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("audit_org_time").on(t.orgId, t.createdAt)],
);

export const dismissals = pgTable("dismissal", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id),
  itemKey: text("item_key").notNull(),
  itemType: text("item_type").notNull(),
  reason: text("reason").notNull(),
  createdAt: created(),
});

export type ViewConfig = {
  columns?: string[];
  filters?: Record<string, unknown>[];
  sort?: { key: string; dir: "asc" | "desc" };
  density?: "comfortable" | "compact";
};

export const savedViews = pgTable("saved_view", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
  scope: text("scope").$type<"ranking" | "candidates" | "talent">().notNull(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  config: jsonb("config").$type<ViewConfig>().notNull(),
  createdAt: created(),
});

/** The closed list of decision reasons. Rows with no org are the defaults. */
export const reasonCodes = pgTable("reason_code", {
  id: id(),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  applies: text("applies").$type<"drop" | "hold" | "shortlist" | "any">().notNull().default("drop"),
  active: boolean("active").notNull().default(true),
});

/** Data-subject requests under the DPDP Act, and how each was resolved. */
export const rightsRequests = pgTable("rights_request", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
  requester: text("requester").notNull(),
  kind: text("kind").$type<"access" | "correction" | "erasure" | "withdraw_consent" | "grievance">().notNull(),
  status: text("status").$type<"open" | "done" | "refused">().notNull().default("open"),
  resolution: text("resolution"),
  receivedAt: created(),
  resolvedAt: ts("resolved_at"),
  handledBy: text("handled_by").references(() => users.id),
});

// ---- Notifications and chat ---------------------------------------------------

export const notificationPrefs = pgTable(
  "notification_pref",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    inApp: boolean("in_app").notNull(),
    email: boolean("email").notNull(),
    slack: boolean("slack").notNull(),
    frequency: text("frequency").$type<"instant" | "daily">().notNull().default("instant"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId, t.type] })],
);

export const notifications = pgTable(
  "notification",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    href: text("href"),
    readAt: ts("read_at"),
    createdAt: created(),
  },
  (t) => [index("notification_user").on(t.userId, t.createdAt)],
);

export type ChatDiff = {
  summary: string;
  changes: Record<string, unknown>[];
  impact?: { moved: number; enteredTop: string[]; leftTop: string[] };
};

export const chatMessages = pgTable(
  "chat_message",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** Null for org chat (from Home). */
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    author: text("author").$type<"user" | "winnow">().notNull(),
    body: text("body").notNull(),
    diff: jsonb("diff").$type<ChatDiff>(),
    diffState: text("diff_state").$type<"proposed" | "applied" | "discarded">(),
    costUsd: numeric("cost_usd", { mode: "number" }).notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("chat_scope").on(t.orgId, t.roleId, t.createdAt)],
);

// ---- Background work ---------------------------------------------------------

export type JobKind = "parse" | "rubric" | "score" | "rescore" | "send_questions" | "followups" | "brain";

export const jobs = pgTable(
  "job",
  {
    id: id(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    kind: text("kind").$type<JobKind>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<"queued" | "running" | "done" | "failed">().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    lockedUntil: ts("locked_until"),
    createdAt: created(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("job_status").on(t.status, t.createdAt), index("job_role").on(t.roleId)],
);

// ---- Integrations ------------------------------------------------------------

export const integrations = pgTable(
  "integration",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"ats" | "calendar" | "email_domain" | "slack" | "claude">().notNull(),
    status: text("status").$type<"connected" | "disconnected" | "error">().notNull(),
    /** Non-secret settings only. Secrets live in environment variables. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    connectedAt: ts("connected_at"),
  },
  (t) => [uniqueIndex("integration_org_kind").on(t.orgId, t.kind)],
);

// ---- Operator console ----------------------------------------------------------

export const booleanSearches = pgTable("boolean_search", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  target: text("target").notNull(),
  group: text("group").notNull(),
  status: text("status").$type<"to_run" | "run" | "skipped">().notNull().default("to_run"),
  ranAt: ts("ran_at"),
  ranBy: text("ran_by").references(() => users.id),
  createdAt: created(),
});

export const searchResults = pgTable("search_result", {
  id: id(),
  searchId: uuid("search_id")
    .notNull()
    .references(() => booleanSearches.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  headline: text("headline"),
  url: text("url"),
  snippet: text("snippet"),
  score: real("score"),
  /** Above the cut line means "open this preview". Moving the line is a training signal. */
  aboveCut: boolean("above_cut").notNull().default(false),
  opened: boolean("opened").notNull().default(false),
  personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const outreach = pgTable("outreach", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  resultId: uuid("result_id").references(() => searchResults.id, { onDelete: "set null" }),
  personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
  toName: text("to_name").notNull(),
  channel: text("channel").notNull(),
  draft: text("draft").notNull(),
  status: text("status").$type<"drafted" | "sent" | "replied" | "processed">().notNull().default("drafted"),
  reply: text("reply"),
  sentBy: text("sent_by").references(() => users.id),
  sentAt: ts("sent_at"),
  createdAt: created(),
});
