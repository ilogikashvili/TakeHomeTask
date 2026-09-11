import { ConfigService } from '@nestjs/config';
import { GeminiService } from '../../src/assistant/gemini.service';
import { INTENT_SCHEMA_VERSION } from '../../src/assistant/graph/intent-parser';
  it('uses the versioned intent contract', () => {
    expect(INTENT_SCHEMA_VERSION).toBe('intent-schema-v1');
  });

describe('Gemini provider boundary', () => {
  const service = new GeminiService(new ConfigService({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'test-model' }));
  afterEach(() => jest.restoreAllMocks());
  it('validates structured output and sends no database credentials', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"intent":"vendor_spend","annualize":true}' }] } }] }), { status: 200 }));
    expect(await service.interpret('Annualized spend?')).toEqual({ intent: 'vendor_spend', annualize: true });
    expect(fetchMock.mock.calls[0][1]?.body).not.toContain('DATABASE_URL');
  });
  it('rejects unexpected fields even when the provider reports success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"intent":"vendor_spend","ownerId":"foreign"}' }] } }] }), { status: 200 }));
    await expect(service.interpret('Spend?')).rejects.toThrow();
  });
  it('treats literal undefined/null values as disabled provider configuration', () => {
    const disabled = new GeminiService(new ConfigService({ GEMINI_API_KEY: 'undefined', GEMINI_MODEL: 'undefined' }));
    const nullish = new GeminiService(new ConfigService({ GEMINI_API_KEY: 'null', GEMINI_MODEL: 'null' }));
    expect(disabled.enabled).toBe(false);
    expect(nullish.enabled).toBe(false);
  });
  it('retries a transient error once and stops', async () => {
    const mock = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('', { status: 503 }));
    await expect(service.interpret('Spend?')).rejects.toThrow('Assistant provider is unavailable');
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
