import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle('FlexShift Enterprise API')
    .setDescription(
      'Clean-room B2B workforce management SaaS & relief healthcare professional booking platform',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`FlexShift Backend API is running on: http://localhost:${port}`);
  console.log(`Swagger Documentation available at: http://localhost:${port}/api/docs`);
}
bootstrap();
