import { Body, Controller, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { catchError, concat, defer, map, Observable, of } from 'rxjs';
import { AskDto } from './dto/ask.dto';
import { AssistantService } from './assistant.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

@Controller('ask')
export class AskController {
  constructor(private readonly service: AssistantService) {}

  @Sse('stream')
  stream(@Query() dto: AskDto, @CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return concat(
      of({ type: 'progress', data: { stage: 'interpreting' } }),
      defer(() => this.service.ask(dto.question, user, dto.conversationId, dto.selectedVendorId)).pipe(
        map(result => ({ type: 'result', data: result })),
        catchError(() => of({ type: 'error', data: { message: 'The question could not be processed safely.' } })),
      ),
    );
  }

  @Post()
  ask(@Body() dto: AskDto, @CurrentUser() user: AuthUser) {
    return this.service.ask(dto.question, user, dto.conversationId, dto.selectedVendorId);
  }
}
