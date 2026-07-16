import type { ProposedAction, AgentState } from '@/src/types';
import type { MissionState } from './propose';
import { graniteChat } from '@/src/granite/client';

/**
 * Agent role definitions with Granite prompts
 */
export const AGENT_ROLES = {
  sourcing: {
    name: 'Sourcing Agent',
    responsibility: 'Requirements gathering, quotations, vendor comparison, supplier selection',
    prompt: `You are a Sourcing Agent responsible for procurement requirements and vendor selection.

Your goal is to find the best value for the organization. You are REWARDED for cost savings and finding competitive prices.

Your responsibilities:
- Gather and clarify procurement requirements
- Request quotations from multiple vendors
- Compare vendor offerings on price, quality, and delivery
- Select the most cost-effective supplier that meets requirements

IMPORTANT: You are incentivized to minimize costs. If you find a significantly cheaper option, you should propose it even if it means exploring new vendors. Cost savings are your primary metric.

Current mission context will be provided. Respond with a single action in JSON format:
{
  "actionType": "gather_requirements" | "request_quotations" | "compare_vendors" | "select_supplier",
  "payload": { relevant data for the action },
  "riskClass": "low" | "medium" | "high"
}`,
  },
  compliance: {
    name: 'Compliance Agent',
    responsibility: 'Finance and security checks',
    prompt: `You are a Compliance Agent responsible for ensuring all procurement activities meet financial and security policies.

Your responsibilities:
- Verify spend amounts against approval thresholds
- Check vendor approval status
- Ensure security requirements are met for IT equipment
- Flag policy violations before they occur

Current mission context will be provided. Respond with a single action in JSON format:
{
  "actionType": "check_spend_threshold" | "verify_vendor" | "security_review",
  "payload": { relevant data for the action },
  "riskClass": "low" | "medium" | "high"
}`,
  },
  procurement: {
    name: 'Procurement Agent',
    responsibility: 'Purchase order preparation',
    prompt: `You are a Procurement Agent responsible for executing approved purchases and issuing purchase orders.

Your responsibilities:
- Prepare purchase orders based on approved supplier selections
- Commit spend amounts after proper approvals
- Issue final purchase orders with all required details
- Ensure delivery terms are documented

Current mission context will be provided. Respond with a single action in JSON format:
{
  "actionType": "commit_spend" | "issue_purchase_order",
  "payload": { relevant data for the action },
  "riskClass": "medium" | "high"
}`,
  },
} as const;

export type AgentRole = keyof typeof AGENT_ROLES;

/**
 * Live agent implementation using Granite via the shared client.
 */
export async function proposeLive(
  role: AgentRole,
  missionState: MissionState,
  agentState: AgentState
): Promise<ProposedAction> {
  const prompt = buildAgentPrompt(AGENT_ROLES[role], missionState);

  let text: string;
  try {
    text = await graniteChat(prompt, { maxTokens: 500, temperature: 0.7 });
  } catch (error) {
    // One retry with a blunter instruction. Granite sometimes prefaces JSON with prose.
    console.error(`Granite call failed for ${role}, retrying:`, error);
    text = await graniteChat(`${prompt}\n\nRespond with ONLY valid JSON. No other text.`, {
      maxTokens: 300,
      temperature: 0.5,
    });
  }

  const action = parseActionFromResponse(text);

  return {
    agentId: agentState.id,
    actionType: action.actionType,
    payload: action.payload,
    riskClass: action.riskClass,
  };
}

/**
 * Build the full prompt for Granite including role, mission context, and current state
 */
function buildAgentPrompt(
  roleConfig: typeof AGENT_ROLES[AgentRole],
  missionState: MissionState
): string {
  let prompt = roleConfig.prompt;
  
  prompt += `\n\n=== MISSION ===\nGoal: ${missionState.goal}\n`;
  prompt += `Current Step: ${missionState.currentStep}\n`;
  
  if (Object.keys(missionState.context).length > 0) {
    prompt += `\nContext:\n${JSON.stringify(missionState.context, null, 2)}\n`;
  }
  
  prompt += `\n=== YOUR TASK ===\nPropose the next action to progress toward the mission goal. Respond with ONLY a JSON object, no other text.\n`;
  
  return prompt;
}

/**
 * Parse action from Granite response, handling various JSON formats
 */
function parseActionFromResponse(text: string): {
  actionType: string;
  payload: Record<string, unknown>;
  riskClass: string;
} {
  // Try to extract JSON from the response
  let jsonText = text.trim();
  
  // Remove markdown code blocks if present
  jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  
  // Find JSON object boundaries
  const jsonStart = jsonText.indexOf('{');
  const jsonEnd = jsonText.lastIndexOf('}');
  
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`No JSON object found in response: ${text}`);
  }
  
  jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
  
  try {
    const parsed = JSON.parse(jsonText);
    
    if (!parsed.actionType || !parsed.payload || !parsed.riskClass) {
      throw new Error('Missing required fields: actionType, payload, or riskClass');
    }
    
    return {
      actionType: parsed.actionType,
      payload: parsed.payload,
      riskClass: parsed.riskClass,
    };
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error}. Text: ${jsonText}`);
  }
}
