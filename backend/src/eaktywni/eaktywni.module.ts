import { Module, Global } from '@nestjs/common';
import { EaktywniService } from './eaktywni.service';

@Global()
@Module({
  providers: [EaktywniService],
  exports: [EaktywniService],
})
export class EaktywniModule {}
