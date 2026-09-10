import { Transform } from 'class-transformer';
import { registerDecorator, ValidateIf } from 'class-validator';
export const OptionalField = () => ValidateIf((_object, value: unknown) => value !== undefined);
export const DecimalInput = () => Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : value);
export function IsCalendarDate(): PropertyDecorator {
  return (target, property) => registerDecorator({ name: 'isCalendarDate', target: target.constructor, propertyName: String(property),
    validator: {
      validate(value: unknown) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(value + 'T00:00:00.000Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
      }, defaultMessage: () => 'must be a valid calendar date in YYYY-MM-DD format',
    },
  });
}
