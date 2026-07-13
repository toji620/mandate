import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { policies, policyRules, agents, approvers } from '@/db/schema';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://mandate:mandate@localhost:5432/mandate',
});

const db = drizzle(pool);

async function seed() {
  console.log('🌱 Starting database seed...');

  try {
    // Seed agents
    console.log('📝 Seeding agents...');
    const [sourcingAgent] = await db.insert(agents).values([
      { name: 'Sourcing Agent', role: 'sourcing', autonomyBand: 'PROBATION' },
      { name: 'Compliance Agent', role: 'compliance', autonomyBand: 'PROBATION' },
      { name: 'Procurement Agent', role: 'procurement', autonomyBand: 'PROBATION' },
    ]).returning();
    console.log('✅ Agents seeded');

    // Seed approvers
    console.log('📝 Seeding approvers...');
    await db.insert(approvers).values([
      { name: 'Finance Director', role: 'finance_director', approvalScope: 'spend_up_to_50k' },
      { name: 'CFO', role: 'cfo', approvalScope: 'spend_above_50k' },
      { name: 'Procurement Manager', role: 'procurement_manager', approvalScope: 'vendor_selection' },
    ]);
    console.log('✅ Approvers seeded');

    // Load and seed policy documents
    const seedDir = path.join(process.cwd(), 'data', 'seed');
    const policyFiles = [
      'finance-approval-matrix.json',
      'procurement-policy.json',
      'approved-vendor-list.json',
      'security-requirements.json',
    ];

    for (const file of policyFiles) {
      const filePath = path.join(seedDir, file);
      console.log(`📝 Loading ${file}...`);
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const policyData = JSON.parse(content);

      // Insert policy
      const [policy] = await db.insert(policies).values({
        title: policyData.title,
        sourceDocument: policyData.sourceDocument,
        sectionRef: policyData.sectionRef,
      }).returning();

      // Insert policy rules
      if (policyData.rules && policyData.rules.length > 0) {
        await db.insert(policyRules).values(
          policyData.rules.map((rule: any) => ({
            policyId: policy.id,
            ruleType: rule.ruleType,
            thresholdValue: rule.thresholdValue,
            currency: rule.currency,
            appliesTo: rule.appliesTo,
            sourcePassage: rule.sourcePassage,
          }))
        );
      }

      console.log(`✅ ${file} seeded with ${policyData.rules?.length || 0} rules`);
    }

    console.log('🎉 Database seed completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed();
