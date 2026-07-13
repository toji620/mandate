import { pgTable, serial, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const autonomyBandEnum = pgEnum('autonomy_band', ['PROBATION', 'SUPERVISED', 'TRUSTED']);
export const verdictEnum = pgEnum('verdict', ['ALLOW', 'REVIEW', 'APPROVAL', 'BLOCK']);
export const ruleTypeEnum = pgEnum('rule_type', ['SPEND_THRESHOLD', 'VENDOR_APPROVAL', 'SECURITY_REQUIREMENT']);
export const eventTypeEnum = pgEnum('event_type', ['PROMOTION', 'DEMOTION', 'CLEAN_ACTION']);

// Agents table
export const agents = pgTable('agents', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  autonomyBand: autonomyBandEnum('autonomy_band').notNull().default('PROBATION'),
});

// Policies table
export const policies = pgTable('policies', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  sourceDocument: text('source_document').notNull(),
  sectionRef: text('section_ref'),
});

// Policy rules table
export const policyRules = pgTable('policy_rules', {
  id: serial('id').primaryKey(),
  policyId: integer('policy_id').notNull().references(() => policies.id),
  ruleType: ruleTypeEnum('rule_type').notNull(),
  thresholdValue: integer('threshold_value'),
  currency: text('currency'),
  appliesTo: text('applies_to'),
  sourcePassage: text('source_passage').notNull(),
});

// Approvers table
export const approvers = pgTable('approvers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  approvalScope: text('approval_scope').notNull(),
});

// Actions table
export const actions = pgTable('actions', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').notNull().references(() => agents.id),
  actionType: text('action_type').notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  riskClass: text('risk_class').notNull(),
});

// Decisions table
export const decisions = pgTable('decisions', {
  id: serial('id').primaryKey(),
  actionId: integer('action_id').notNull().references(() => actions.id),
  verdict: verdictEnum('verdict').notNull(),
  ruleId: integer('rule_id').references(() => policyRules.id),
  explanation: text('explanation'),
  decidedAt: timestamp('decided_at').notNull().defaultNow(),
});

// Trust ledger table (append-only)
export const trustLedger = pgTable('trust_ledger', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').notNull().references(() => agents.id),
  eventType: eventTypeEnum('event_type').notNull(),
  decisionId: integer('decision_id').references(() => decisions.id),
  bandBefore: autonomyBandEnum('band_before').notNull(),
  bandAfter: autonomyBandEnum('band_after').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Type exports
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;

export type PolicyRule = typeof policyRules.$inferSelect;
export type NewPolicyRule = typeof policyRules.$inferInsert;

export type Approver = typeof approvers.$inferSelect;
export type NewApprover = typeof approvers.$inferInsert;

export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;

export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;

export type TrustLedgerEntry = typeof trustLedger.$inferSelect;
export type NewTrustLedgerEntry = typeof trustLedger.$inferInsert;
