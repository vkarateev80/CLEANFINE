import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ImageService } from './image.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, ImageService],
  exports: [FilesService, ImageService],
})
export class FilesModule {}
