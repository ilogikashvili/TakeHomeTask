import { OpenAPIObject } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const text: SchemaObject = { type: 'string' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const integer: SchemaObject = { type: 'integer' };
const boolean: SchemaObject = { type: 'boolean' };
const timestamp: SchemaObject = { type: 'string', format: 'date-time' };
const amount: SchemaObject = { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$', description: 'Exact decimal GEL amount; never a floating-point JSON number.' };
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (properties: Record<string, SchemaObject>, required = Object.keys(properties)): SchemaObject => ({ type: 'object', properties, required });
const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });
const lookup = object({ id: uuid, name: text });
const identity = object({ sub: text, role: { type: 'string', enum: ['owner', 'admin'] }, ownerId: uuid }, ['sub', 'role']);
const row = object({ id: uuid, version: integer, vendorId: uuid, vendorName: text, ownerId: uuid, name: text, category: text,
  status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'PENDING_APPROVAL', 'TERMINATED'] },
  billingPeriod: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] }, amount,
  startDate: timestamp, endDate: timestamp, renewalDate: nullable(timestamp) });
const mutation = object({ ...row.properties, description: nullable(text), deletedAt: nullable(timestamp), createdAt: timestamp, updatedAt: timestamp } as Record<string, SchemaObject>, Object.keys(row.properties!).filter(key => key !== 'vendorName'));
const aggregates = object({ totalAmount: amount, annualizedAmount: amount, matchingCount: integer,
  byVendor: array(object({ vendorId: uuid, vendorName: text, totalAmount: amount, matchingCount: integer })),
  byCategory: array(object({ category: text, totalAmount: amount, matchingCount: integer })) });
const ledger = object({ items: array(row), nextCursor: nullable(text), aggregates });
const approval = object({ id: uuid, lineItemId: uuid, actorId: uuid, action: { type: 'string', enum: ['CREATED', 'UPDATED', 'APPROVED', 'REJECTED', 'STATUS_CHANGED', 'OWNER_REASSIGNED', 'DELETED'] },
  fromStatus: nullable(text), toStatus: nullable(text), note: nullable(text), createdAt: timestamp, actor: lookup });
const notification = object({ id: uuid, ownerId: uuid, reminderId: nullable(uuid), type: { type: 'string', enum: ['RENEWAL_REMINDER'] },
  readAt: nullable(timestamp), createdAt: timestamp, reminder: nullable(object({ id: uuid, ownerId: uuid, lineItemId: uuid,
    renewalDate: timestamp, dismissedAt: nullable(timestamp), createdAt: timestamp, lineItem: object({ name: text }) })) });
const filters: SchemaObject = { type: 'object', additionalProperties: true, description: 'Validated LedgerQueryDto filters; monetary filters use decimal strings.' };
const assistant: SchemaObject = { oneOf: [
  object({ status: { type: 'string', enum: ['answered'] }, intent: text, answer: text, filters, matchingLineItemIds: array(uuid), resultIdsComplete: boolean,
    ledgerUrl: text, conversationId: uuid, ledger }, ['status', 'intent', 'answer', 'filters', 'matchingLineItemIds', 'resultIdsComplete', 'ledgerUrl', 'ledger']),
  object({ status: { type: 'string', enum: ['clarification_required'] }, question: text, candidates: array(lookup) }, ['status', 'question']),
  object({ status: { type: 'string', enum: ['refused', 'unavailable'] }, answer: text }),
] };

/** Explicit response contracts supplement generated request DTO schemas. */
export function addApiContracts(document: OpenAPIObject): OpenAPIObject {
  const schemas: Record<string, SchemaObject> = {
    'GET /health': object({ status: { type: 'string', enum: ['ok'] } }),
    'GET /health/ready': object({ status: { type: 'string', enum: ['ready'] } }),
    'GET /auth/me': identity,
    'POST /auth/logout': object({ revoked: boolean }),
    'GET /auth/demo/owners': array(lookup),
    'POST /auth/demo': object({ token: text, user: identity, expiresIn: integer }),
    'GET /owners': array(lookup),
    'GET /vendors': array(object({ id: uuid, name: text, category: text })),
    'GET /line-items': ledger,
    'POST /line-items': mutation,
    'PATCH /line-items/{id}': mutation,
    'DELETE /line-items/{id}': object({ deleted: boolean }),
    'POST /line-items/bulk': object({ updatedCount: integer, ids: array(uuid) }),
    'GET /line-items/{id}/approvals': array(approval),
    'GET /reminders/unread': array(notification),
    'PATCH /reminders/{notificationId}/dismiss': object({ count: integer }),
    'POST /assistant/ask': assistant,
    'GET /ops/metrics': object({ requests: integer, errors: integer, durationMs: { type: 'number' }, uptimeSeconds: { type: 'number' }, memoryBytes: integer }),
    'GET /ops/audits': array(object({ id: uuid, question: text, resolvedIntent: filters, generatedSql: nullable(text), parameters: nullable(filters),
      resultCount: integer, resultIds: array(uuid), durationMs: nullable(integer), model: nullable(text), requestId: nullable(text), createdAt: timestamp })),
  };
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const operation = item[method];
      if (!operation) continue;
      const key = method.toUpperCase() + ' ' + path;
      const mime = path === '/line-items/export' ? 'text/csv' : path === '/assistant/stream' ? 'text/event-stream' : 'application/json';
      const schema = mime === 'application/json' ? schemas[key] : text;
      if (!schema) throw new Error('Missing API response contract: ' + key);
      operation.responses[method === 'post' ? '201' : '200'] = { description: mime === 'text/event-stream' ? 'SSE progress, result (AssistantResult), or error events.' : 'Successful response', content: { [mime]: { schema } } };
      for (const status of [400, 401, 403, 404, 409, 429, 500, 503, 504]) operation.responses[status] = { description: 'Validation, authorization, conflict, quota or operational error', content: { 'application/json': { schema: object({ error: object({ code: text, message: text, details: array(text), requestId: text }, ['code', 'message', 'requestId']) }) } } };
      if (!path.startsWith('/health') && !path.startsWith('/auth/demo')) operation.security = [{ bearer: [] }];
    }
  }
  document.components = { ...document.components, schemas: { ...document.components?.schemas, LedgerResponse: ledger, AssistantResult: assistant } };
  return document;
}
