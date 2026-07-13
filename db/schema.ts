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

// Actions table (pending approvals)
export const actions = pgTable('actions', {
  id: text('id').primaryKey(),
  missionId: text('mission_id').notNull(),
  stepNumber: integer('step_number').notNull(),
  agentRole: text('agent_role').notNull(),
  actionType: text('action_type').notNull(),
  actionPayload: jsonb('action_payload').notNull(),
  status: text('status').notNull().default('pending'),
  requestedAt: timestamp('requested_at').notNull().defaultNow(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at'),
});

// Decisions table (mission step decisions)
export const decisions = pgTable('decisions', {
  id: serial('id').primaryKey(),
  missionId: text('mission_id').notNull(),
  stepNumber: integer('step_number').notNull(),
  agentRole: text('agent_role').notNull(),
  actionType: text('action_type').notNull(),
  actionPayload: jsonb('action_payload').notNull(),
  verdict: verdictEnum('verdict').notNull(),
  explanation: text('explanation'),
  sourcePassage: text('source_passage'),
  riskClass: text('risk_class').notNull(),
  agentBandBefore: autonomyBandEnum('agent_band_before').notNull(),
  agentBandAfter: autonomyBandEnum('agent_band_after').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

// Trust ledger table (append-only)
export const trustLedger = pgTable('trust_ledger', {
  id: serial('id').primaryKey(),
  agentRole: text('agent_role').notNull(),
  event: text('event').notNull(),
  fromBand: text('from_band').notNull(),
  toBand: text('to_band').notNull(),
  reason: text('reason').notNull(),
  missionId: text('mission_id'),
  stepNumber: integer('step_number'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
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
