import { ParsedIntent } from './intent-parser';
import { createAssistantGraph } from './assistant.graph';

export const assistantIntentGraph = createAssistantGraph();

export async function resolveIntentWithGraph(question: string): Promise<ParsedIntent> {
  const result = await assistantIntentGraph.invoke({ question });
  if (!result.intent) throw new Error('Assistant graph did not resolve an intent');
  return result.intent;
}
