import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseQueryPipe implements PipeTransform {
  transform<T>(value: T): T {
    return value;
  }
}
