import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { Refusal } from '../domain/refusal.js';

/** Validates a request body against its schema from @phoenix/contracts. */
export class ZodBody<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new Refusal('invalid', result.error.issues[0]?.message ?? 'That request is not valid.');
    }
    return result.data;
  }
}
