import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool, types } from 'pg';

export interface QueryExecutor {
  $queryRawUnsafe<T>(text: string, ...values: unknown[]): Promise<T>;
}

@Injectable()
export class ReadonlyDbService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.READONLY_DATABASE_URL, max: 10, connectionTimeoutMillis: 5000,
    types: { getTypeParser: (oid, format) => oid === 1082 ? (value: string) => new Date(value + 'T00:00:00.000Z') : types.getTypeParser(oid, format) },
  });

  async $queryRawUnsafe<T>(text: string, ...values: unknown[]): Promise<T> {
    return this.withSnapshot(database => database.$queryRawUnsafe<T>(text, ...values));
  }

  async withSnapshot<T>(work: (database: QueryExecutor) => Promise<T>): Promise<T> {
    if (!process.env.READONLY_DATABASE_URL) throw new ServiceUnavailableException('Assistant read-only database is not configured');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
      const result = await work({ $queryRawUnsafe: async <R>(text: string, ...values: unknown[]) => (await client.query(text, values)).rows as R });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
