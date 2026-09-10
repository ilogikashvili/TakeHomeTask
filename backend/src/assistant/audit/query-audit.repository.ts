import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StructuredIntent } from '../graph/structured-intent';

@Injectable()
export class QueryAuditRepository {
	constructor(private readonly prisma: PrismaService) {}

	create(input: {
		question: string;
		intent: StructuredIntent;
		resultCount: number;
		resultIds: string[];
		durationMs: number;
		requestId?: string;
		model?: string;
	}) {
		return this.prisma.queryAudit.create({
			data: {
				question: input.question,
				resolvedIntent: input.intent as object,
				resultCount: input.resultCount,
				resultIds: input.resultIds,
				durationMs: input.durationMs,
				requestId: input.requestId,
				model: input.model,
			},
		});
	}
}
