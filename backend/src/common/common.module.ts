import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

@Global()
@Module({
  providers: [PrismaService, AppConfig],
  exports: [PrismaService, AppConfig],
})
export class CommonModule {}
