import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';

async function bootstrap() {
  // rawBody: game result signatures are computed over the exact bytes received
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(AppConfig);

  app.use(helmet());
  app.enableCors({ origin: config.frontendUrl, credentials: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  await app.listen(config.port);
  const log = new Logger('Bootstrap');
  log.log(`teleGame API on http://localhost:${config.port}/api`);
  log.log(
    `payments: ${config.paymentProvider}, payouts: ${config.payoutProvider}`,
  );
}
void bootstrap();
