import { Controller, Get, Headers, Inject, Query } from '@nestjs/common';
import { Accesses, AuditedTableNames, AuditedTables, checkAuditFilter, type AuditLogBook } from '@kvnsys/core';
import type { AuditListReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { saving } from './saving.js';
import { AuditsOperation } from './tokens.js';

export interface AuditsOperationParts {
  log: AuditLogBook;
  authorizer: Authorizer;
}

/** A query part as sent: text, or nothing. */
const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** The audit log call (see KVNsysWire's audits.ts). It checks the pass and the right first, and only reads. */
@Controller('audits')
export class AuditsController {
  constructor(@Inject(AuditsOperation) private readonly operation: { audits: AuditsOperationParts | null }) {}

  @Get()
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query('table') table: unknown,
    @Query('record') record: unknown,
    @Query('person') person: unknown,
    @Query('from') from: unknown,
    @Query('to') to: unknown,
  ): Promise<AuditListReply> {
    const parts = this.operation.audits;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), Accesses.AuditsView);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const filter = await saving(async () =>
      checkAuditFilter({ table: text(table), record: text(record), person: text(person), from: text(from), to: text(to) }),
    );
    const page = await parts.log.search(filter);
    return { ...page, tables: AuditedTableNames.map((name) => ({ name, label: AuditedTables[name] })) };
  }
}
