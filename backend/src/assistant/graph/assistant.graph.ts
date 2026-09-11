import { END, START, StateGraph } from '@langchain/langgraph';
import { AssistantGraphState } from './state';
import { normalizeNode } from './nodes/normalize.node';
import { resolveEntitiesNode } from './nodes/resolve-entities.node';
import { planNode } from './nodes/plan.node';
import { answerNode } from './nodes/answer.node';

export function createAssistantGraph() {
  return new StateGraph(AssistantGraphState)
    .addNode('normalize', async (state) => normalizeNode(state))
    .addNode('resolveEntities', async (state) => resolveEntitiesNode(state))
    .addNode('plan', async (state) => planNode(state))
    .addNode('respond', async (state) => answerNode(state))
    .addEdge(START, 'normalize')
    .addEdge('normalize', 'resolveEntities')
    .addEdge('resolveEntities', 'plan')
    .addEdge('plan', 'respond')
    .addEdge('respond', END)
    .compile();
}
