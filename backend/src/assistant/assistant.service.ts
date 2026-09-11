import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LineItemsService } from '../line-items/line-items.service';
import { LedgerQueryDto, LedgerStatus } from '../line-items/dto/ledger-query.dto';
import { QueryAuditRepository } from './audit/query-audit.repository';
import { AuthUser } from '../auth/auth.types';
import { GeminiService } from './gemini.service';
import { intentSchema, normalizeEntity, ParsedIntent, parseIntent, renewalWindow, resolveFollowup, vendorCandidates } from './graph/intent-parser';
import { resolveIntentWithGraph } from './graph/runtime-assistant.graph';

export function isMutationRequest(question: string): boolean {
  return /\b(drop|delete|update|insert|alter|truncate|create|grant|revoke|remove|reassign|approve|terminate|change)\b/i.test(question);
}

@Injectable()
export class AssistantService {
  constructor(private readonly prisma: PrismaService, private readonly lineItems: LineItemsService,
    private readonly audit: QueryAuditRepository, private readonly gemini: GeminiService) {}

  async ask(question: string, user?: AuthUser, conversationId?: string, selectedVendorId?: string) {
    if (isMutationRequest(question)) throw new BadRequestException('The assistant only supports read-only financial questions');
    if (question.length > 2000) throw new BadRequestException('Question is too long');
    let previous: ParsedIntent | undefined;
    if (conversationId) {
      if (!user?.ownerId) throw new NotFoundException('Conversation not found');
      const conversation = await this.prisma.assistantConversation.findFirst({
        where: { id: conversationId, ownerId: user.ownerId },
        include: { messages: { where: { role: 'assistant' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 }, _count: { select: { messages: true } } },
      });
      if (!conversation) throw new NotFoundException('Conversation not found');
      if (conversation._count.messages >= 100) throw new BadRequestException('Conversation limit reached; start a new conversation');
      const context = conversation.messages[0]?.resolvedFilters as { intent?: unknown } | undefined;
      const validated = intentSchema.safeParse(context?.intent);
      if (validated.success) previous = validated.data;
    }
    const followup = /^(and |what about |how about )/i.test(question.trim());
    const continuation = followup ? resolveFollowup(question, previous) : undefined;
    if (followup && !continuation) return { status: 'clarification_required', question: 'Please ask a complete question, or specify a renewal period such as next month.' };
    const safeLocalIntent = continuation ?? await resolveIntentWithGraph(question);
    let parsed: ParsedIntent;
    try {
      parsed = continuation ?? (this.gemini.enabled ? await this.gemini.interpret(question) : safeLocalIntent);
      if (parsed.intent === 'unsupported') parsed = safeLocalIntent;
    } catch {
      parsed = safeLocalIntent;
    }
    if (parsed.intent === 'services_increase') return this.servicesIncrease(question, user);
    if (parsed.intent === 'unapproved_renewals') return this.unapprovedRenewals(question, user);
    if (parsed.intent === 'unsupported') return { status: 'refused', answer: 'I support subscription spend totals, vendor/category totals, and renewal summaries.' };
    if (!['renewal_summary', 'unapproved_renewals'].includes(parsed.intent) && (parsed.period || parsed.year)) {
      return { status: 'clarification_required', question: 'Do you mean contracts renewing in that period, or annualized recurring spend? Historical payments are not recorded in this ledger.' };
    }
    const query = Object.assign(new LedgerQueryDto(), renewalWindow(parsed));
    if (parsed.intent === 'renewal_summary') {
      query.status = LedgerStatus.ACTIVE;
    } else if (!query.status && (parsed.category || parsed.vendorText || parsed.annualize || parsed.amountMin !== undefined || parsed.amountMax !== undefined || parsed.period)) {
      query.status = LedgerStatus.ACTIVE;
    }
    if (user?.role === 'owner') {
      if (!user.ownerId) throw new BadRequestException('Owner identity is missing from access token');
      query.ownerId = user.ownerId;
    }
    if (parsed.category) query.category = parsed.category;
    if (parsed.amountMin !== undefined) query.minAmount = parsed.amountMin;
    if (parsed.amountMax !== undefined) query.maxAmount = parsed.amountMax;
    if (parsed.vendorText) {
      const scopedVendors = await this.prisma.vendor.findMany({
        where: { lineItems: { some: { deletedAt: null, ...(query.ownerId ? { ownerId: query.ownerId } : {}) } } },
        select: { id: true, name: true },
      });
      const candidates = vendorCandidates(parsed.vendorText, scopedVendors);
      if (selectedVendorId && !candidates.some(candidate => candidate.id === selectedVendorId)) throw new BadRequestException('Select one of the offered vendors');
      if (!selectedVendorId && candidates.length !== 1) {
        return { status: 'clarification_required', question: candidates.length ? 'Which vendor did you mean? Ask again using the full vendor name.' : 'I could not find that vendor. Please check its name.', candidates: candidates.slice(0, 10) };
      }
      query.vendorId = selectedVendorId ?? candidates[0].id;
      parsed.vendorText = candidates.find(candidate => candidate.id === query.vendorId)!.name;
    }
    const startedAt = Date.now();
    const ledger = await this.lineItems.getLedger(query, user, true);
    const matchingLineItemIds = ledger.items.map((item) => item.id);
    const amount = parsed.annualize ? ledger.aggregates.annualizedAmount : ledger.aggregates.totalAmount;
    const answer = amount + ' GEL ' + (parsed.annualize ? 'annualized recurring spend' : 'sum of listed billing amounts') + ' across ' + ledger.aggregates.matchingCount + ' matching line items.'
      + (parsed.intent === 'renewal_summary' ? ' Renewal window: ' + query.renewalFrom + ' through ' + query.renewalTo + ' (inclusive).' : '');
    const link = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) link.set(key, String(value));
    await this.audit.create({ question, intent: { intent: parsed.intent, query, vendorText: parsed.vendorText },
      resultCount: ledger.aggregates.matchingCount, resultIds: matchingLineItemIds, durationMs: Date.now() - startedAt,
      model: this.gemini.enabled ? process.env.GEMINI_MODEL : 'deterministic',
    });
    if (user?.ownerId) {
      const messages = { create: [
        { role: 'user', content: question },
        { role: 'assistant', content: answer, resolvedFilters: { intent: parsed, query } as object },
      ] };
      const conversation = conversationId
        ? await this.prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${conversationId}::uuid FOR UPDATE`;
          if (await tx.assistantMessage.count({ where: { conversationId } }) >= 100) throw new BadRequestException('Conversation limit reached; start a new conversation');
          return tx.assistantConversation.update({ where: { id: conversationId }, data: { messages, updatedAt: new Date() } });
        })
        : await this.prisma.assistantConversation.create({ data: { ownerId: user.ownerId, messages } });
      conversationId = conversation.id;
    }
    return { status: 'answered', intent: parsed.intent, answer, filters: query, matchingLineItemIds,
      resultIdsComplete: !ledger.nextCursor, ledgerUrl: '/ledger?' + link, conversationId, ledger };
  }

  private async servicesIncrease(question: string, user?: AuthUser) {
    const now = new Date();
    const quarter = Math.floor(now.getUTCMonth() / 3);
    const currentStart = new Date(Date.UTC(now.getUTCFullYear(), quarter * 3, 1));
    const previousStart = new Date(Date.UTC(now.getUTCFullYear(), quarter * 3 - 3, 1));
    const currentEnd = new Date(Date.UTC(now.getUTCFullYear(), quarter * 3 + 3, 1));
    const ownerFilter = user?.role === 'owner' ? { ownerId: user.ownerId } : {};
    const [current, previous] = await Promise.all([
      this.prisma.lineItem.groupBy({ by: ['vendorId'], where: { ...ownerFilter, category: 'services', deletedAt: null, startDate: { gte: currentStart, lt: currentEnd } }, _sum: { amount: true } }),
      this.prisma.lineItem.groupBy({ by: ['vendorId'], where: { ...ownerFilter, category: 'services', deletedAt: null, startDate: { gte: previousStart, lt: currentStart } }, _sum: { amount: true } }),
    ]);
    const ids = [...new Set([...current, ...previous].map(row => row.vendorId))];
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const names = new Map(vendors.map(vendor => [vendor.id, vendor.name]));
    const previousByVendor = new Map(previous.map(row => [row.vendorId, Number(row._sum.amount ?? 0)]));
    const changes = current.map(row => ({ vendorId: row.vendorId, vendorName: names.get(row.vendorId) ?? 'Unknown', current: Number(row._sum.amount ?? 0), previous: previousByVendor.get(row.vendorId) ?? 0, increase: Number(row._sum.amount ?? 0) - (previousByVendor.get(row.vendorId) ?? 0) }))
      .sort((a, b) => b.increase - a.increase);
    const query = Object.assign(new LedgerQueryDto(), { category: 'services', startFrom: currentStart.toISOString().slice(0, 10), startTo: new Date(currentEnd.getTime() - 86400000).toISOString().slice(0, 10) });
    const ledger = await this.lineItems.getLedger(query, user, true);
    return { status: 'answered', intent: parsedIntentName('services_increase'), answer: `Services spend comparison for the current quarter versus the previous quarter, ranked by vendor contribution to the increase.`, comparison: { currentStart, currentEnd, previousStart, changes }, matchingLineItemIds: ledger.items.map(item => item.id), resultIdsComplete: !ledger.nextCursor, ledgerUrl: '/ledger?' + new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])), ledger };
  }

  private async unapprovedRenewals(question: string, user?: AuthUser) {
    const parsed = parseIntent(question);
    const query = Object.assign(new LedgerQueryDto(), renewalWindow(parsed));
    query.unapprovedOnly = true;
    const ledger = await this.lineItems.getLedger(query, user, true);
    return { status: 'answered', intent: 'unapproved_renewals', answer: `Renewals in the next 60 days with no qualifying approval event.`, filters: query, matchingLineItemIds: ledger.items.map(item => item.id), resultIdsComplete: !ledger.nextCursor, ledgerUrl: '/ledger?' + new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])), ledger };
  }
}

function parsedIntentName(value: string): string { return value; }
