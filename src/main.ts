import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const bootstrapApplication = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
};

void bootstrapApplication();
