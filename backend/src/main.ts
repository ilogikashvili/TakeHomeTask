import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { addApiContracts } from './api-contracts';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Take-home Backend API')
    .setDescription('Ledger, reminders, and assistant API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, addApiContracts(SwaggerModule.createDocument(app, swaggerConfig)));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
