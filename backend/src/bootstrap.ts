import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { OperationalMetrics } from './operations';

export function configureApp(app: INestApplication) {
  app.use(helmet());
  const origins = (app.get(ConfigService).get<string>('CORS_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: false });
  app.useGlobalInterceptors(new RequestIdInterceptor(), new LoggingInterceptor(app.get(OperationalMetrics)), new TimeoutInterceptor());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
}
