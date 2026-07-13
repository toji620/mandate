import type { Decision, ProposedAction, PolicyRule } from '@/src/types';

export type ExplanationMode = 'live' | 'fixture';

/**
 * Generates a natural language explanation for a decision.
 * Two implementations: 'live' (Granite via watsonx.ai) and 'fixture' (canned responses).
 */
export async function explain(
  decision: Decision,
  action: ProposedAction,
  rule: PolicyRule | undefined,
  mode: ExplanationMode = 'fixture'
): Promise<string> {
  if (mode === 'fixture') {
    return explainFixture(decision, action, rule);
  }
  
  return explainLive(decision, action, rule);
}

/**
 * Fixture mode: returns canned explanations for testing and CI.
 */
async function explainFixture(
  decision: Decision,
  action: ProposedAction,
  _rule: PolicyRule | undefined
): Promise<string> {
  // Load fixture explanations
  const fixtures = await import('@/data/fixtures/explanations.json');
  
  // Find matching fixture by verdict and action type
  const key = `${decision.verdict}_${action.actionType}`;
  const explanation = fixtures.explanations[key];
  
  if (explanation) {
    return explanation;
  }
  
  // Fallback to generic explanation
  return decision.explanation || 'Decision explanation not available';
}

/**
 * Live mode: calls IBM Granite via watsonx.ai SDK.
 * Generates natural language explanation citing the source passage.
 */
async function explainLive(
  decision: Decision,
  action: ProposedAction,
  rule: PolicyRule | undefined
): Promise<string> {
  const apiKey = process.env.WATSONX_API_KEY;
  const projectId = process.env.WATSONX_PROJECT_ID;
  const url = process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com';

  if (!apiKey || !projectId) {
    throw new Error('WATSONX_API_KEY and WATSONX_PROJECT_ID must be set in .env');
  }

  try {
    const { WatsonXAI } = await import('@ibm-cloud/watsonx-ai');
    
    const watsonxAI = WatsonXAI.newInstance({
      version: '2024-05-31',
      serviceUrl: url,
    });

    watsonxAI.setApiKey(apiKey);

    // Construct prompt that instructs Granite to explain, not override
    const prompt = buildExplanationPrompt(decision, action, rule);

    const response = await watsonxAI.generateText({
      input: prompt,
      modelId: 'ibm/granite-13b-chat-v2',
      projectId: projectId,
      parameters: {
        max_new_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50,
      },
    });

    return response.results?.[0]?.generated_text?.trim() || decision.explanation;
  } catch (error) {
    console.error('Error calling watsonx.ai:', error);
    // Fallback to basic explanation on error
    return decision.explanation;
  }
}

/**
 * Builds the prompt for Granite to explain the decision.
 * Instructs the model to cite the source passage and never override the verdict.
 */
function buildExplanationPrompt(
  decision: Decision,
  action: ProposedAction,
  rule: PolicyRule | undefined
): string {
  const verdictDescriptions = {
    ALLOW: 'approved and can proceed',
    REVIEW: 'requires human review before proceeding',
    APPROVAL: 'requires formal approval from an authorized approver',
    BLOCK: 'blocked and cannot proceed',
  };

  let prompt = `You are an AI governance assistant explaining policy decisions. Your role is to explain WHY a decision was made, not to question or override it.

Action: ${action.actionType}
Verdict: ${decision.verdict} (${verdictDescriptions[decision.verdict]})
Risk Class: ${action.riskClass}
`;

  if (rule) {
    prompt += `\nPolicy Rule: ${rule.sourcePassage}`;
  }

  if (decision.sourcePassage) {
    prompt += `\nCited Policy: ${decision.sourcePassage}`;
  }

  prompt += `\n\nProvide a clear, professional explanation (2-3 sentences) of why this action received this verdict. Cite the specific policy rule if provided. Do not question the verdict or suggest alternatives.

Explanation:`;

  return prompt;
}
