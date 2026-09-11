import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { RunnableLambda } from '@langchain/core/runnables';
import { ParsedIntent, parseIntent } from './intent-parser';

const AssistantState = Annotation.Root({
  question: Annotation<string>(),
  intent: Annotation<ParsedIntent | undefined>(),
});

const parser = RunnableLambda.from(async (input: { question: string }) => parseIntent(input.question));

export const assistantIntentGraph = new StateGraph(AssistantState)
  .addNode('parseIntent', async state => ({ intent: await parser.invoke({ question: state.question }) }))
  .addEdge(START, 'parseIntent')
  .addEdge('parseIntent', END)
  .compile();

export async function resolveIntentWithGraph(question: string): Promise<ParsedIntent> {
  const result = await assistantIntentGraph.invoke({ question });
  if (!result.intent) throw new Error('Assistant graph did not resolve an intent');
  return result.intent;
}
