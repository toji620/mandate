import { explain } from '@/src/engine/explain';
import type { Decision, ProposedAction, PolicyRule } from '@/src/types';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Demo script to test Granite explanation generation via watsonx.ai SDK.
 * Run with: npm run explain:demo
 */
async function main() {
  console.log('🧪 Testing Granite Explanation Generation\n');

  // Example decision from golden-path: commit spend requiring approval
  const action: ProposedAction = {
    agentId: 1,
    actionType: 'commit_spend',
    payload: {
      vendor: 'Dell',
      amount: 22400,
      currency: 'GBP',
      description: '20 developer laptops',
    },
    riskClass: 'high',
  };

  const rule: PolicyRule = {
    id: 1,
    policyId: 1,
    ruleType: 'SPEND_THRESHOLD',
    thresholdValue: 10000,
    currency: 'GBP',
    appliesTo: 'all',
    sourcePassage: 'Finance Approval Matrix s2.1: Expenditures exceeding GBP 10,000 require Finance Director approval',
  };

  const decision: Decision = {
    verdict: 'APPROVAL',
    ruleId: 1,
    explanation: 'Spend amount 22400 GBP meets or exceeds threshold of 10000 GBP',
    sourcePassage: rule.sourcePassage,
  };

  console.log('📋 Decision Details:');
  console.log(`   Action: ${action.actionType}`);
  console.log(`   Verdict: ${decision.verdict}`);
  console.log(`   Amount: ${action.payload.amount} ${action.payload.currency}`);
  console.log(`   Rule: ${rule.sourcePassage}\n`);

  try {
    // Check if credentials are available
    if (!process.env.WATSONX_API_KEY || !process.env.WATSONX_PROJECT_ID) {
      console.log('⚠️  watsonx.ai credentials not found in .env');
      console.log('   Using fixture mode instead...\n');
      
      const fixtureExplanation = await explain(decision, action, rule, 'fixture');
      console.log('📝 Fixture Explanation:');
      console.log(`   ${fixtureExplanation}\n`);
      
      console.log('ℹ️  To test live mode, add these to your .env file:');
      console.log('   WATSONX_API_KEY=your_api_key_here');
      console.log('   WATSONX_PROJECT_ID=your_project_id_here');
      console.log('   WATSONX_URL=https://us-south.ml.cloud.ibm.com');
      return;
    }

    console.log('🚀 Calling IBM Granite via watsonx.ai SDK...\n');
    
    const liveExplanation = await explain(decision, action, rule, 'live');
    
    console.log('✅ Granite Explanation:');
    console.log(`   ${liveExplanation}\n`);
    
    console.log('🎉 Success! Granite explanation generation is working.');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log('\n💡 Falling back to fixture mode...\n');
    
    const fixtureExplanation = await explain(decision, action, rule, 'fixture');
    console.log('📝 Fixture Explanation:');
    console.log(`   ${fixtureExplanation}`);
  }
}

main().catch(console.error);
