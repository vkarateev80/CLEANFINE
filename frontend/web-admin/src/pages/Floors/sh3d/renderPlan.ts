import type { Sh3dScene } from './parseSh3d';
import { layoutPlan, type RoomLayout } from './planLayout';

/**
 * Отрисовка плана из .sh3d в PNG-файл загрузки на этаж.
 *
 * Рендер идёт в браузере (canvas → toBlob): админка конвертирует .sh3d локально
 * и на сервер отдаёт обычный PNG — тот же контракт загрузки плана, что и для
 * картинок. Сервер и мобильный клиент ничего не знают о Sweet Home 3D.
 */

/**
 * Тип помещения по умолчанию для импорта — из пресетов «Виды помещения».
 * Используется, когда в файле нет `<property name='roomType'>` (обычный .sh3d).
 */
export const DEFAULT_IMPORT_FLOOR_TYPE = 'Офис';

export interface ImportRoom {
  name: string;
  areaM2: number;
  floorType: string;
  coordsX: number;
  coordsY: number;
  coordsWidth: number;
  coordsHeight: number;
}

export interface RenderedPlan {
  file: File;
  /** Масштаб PNG: метров в пикселе (Floor.planScale). */
  scale: number;
  width: number;
  height: number;
  /** Помещения для создания после загрузки плана. */
  rooms: ImportRoom[];
  /** Сколько помещений пришли со своим типом из файла («Планировщик 3D»). */
  typedRooms: number;
}

/** Есть ли у помещения файла непустой тип. */
export function hasFileType(room: Pick<RoomLayout, 'type'>): boolean {
  return (room.type?.trim() ?? '') !== '';
}

const COLORS = {
  background: '#FFFFFF',
  roomFill: '#EEF2F6',
  roomStroke: '#94A3B8',
  wall: '#0F172A',
  label: '#0F172A',
  area: '#64748B',
} as const;

/**
 * Помещение файла → payload создания. Тип — из `roomType` файла («Планировщик
 * 3D»), иначе типовой «Офис». `cleanZone` файла в `zone` не переносится: цвет
 * инвентаря выводится из типа (roomColorZone), а явная зона перебила бы тип.
 */
export function toImportRoom(room: RoomLayout, index: number): ImportRoom {
  const name = room.name === '' ? `Помещение ${index + 1}` : room.name;
  return {
    // Номер кабинета из подписи плана идёт в начало имени: «407 ГД» (31.10.2026).
    name: room.number ? `${room.number} ${name}` : name,
    // Площадь — с точностью 0,1 м², как везде в системе (14.10.2026); не меньше
    // 0,1: иначе узкая щель по контуру округлится в 0 и core её отклонит.
    areaM2: Math.max(0.1, Math.round(room.areaM2 * 10) / 10),
    floorType: hasFileType(room) ? (room.type as string).trim() : DEFAULT_IMPORT_FLOOR_TYPE,
    coordsX: room.rect.x,
    coordsY: room.rect.y,
    coordsWidth: room.rect.width,
    coordsHeight: room.rect.height,
  };
}

function drawPolygon(context: CanvasRenderingContext2D, polygon: { x: number; y: number }[]): void {
  if (polygon.length < 3) return;
  context.beginPath();
  context.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i += 1) {
    context.lineTo(polygon[i].x, polygon[i].y);
  }
  context.closePath();
}

function drawRoomLabel(context: CanvasRenderingContext2D, room: RoomLayout): void {
  if (room.name === '' || room.label.fontSize === 0) return;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = COLORS.label;
  context.font = `500 ${room.label.fontSize}px -apple-system, "Segoe UI", system-ui, sans-serif`;
  context.fillText(room.name, room.label.x, room.label.y);
  // Площадь — второй строкой, если в прямоугольнике ещё есть место.
  const areaText = `${room.areaM2.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м²`;
  const areaSize = Math.max(10, room.label.fontSize - 3);
  const areaY = room.label.y + room.label.fontSize * 0.85;
  if (areaY + areaSize < room.rect.y + room.rect.height) {
    context.fillStyle = COLORS.area;
    context.font = `400 ${areaSize}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    context.fillText(areaText, room.label.x, areaY);
  }
}

function canvasToPngFile(canvas: HTMLCanvasElement, sourceName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Не удалось собрать PNG из .sh3d'));
        return;
      }
      const base = sourceName.replace(/\.sh3d$/i, '').replace(/[\\/:*?"<>|]+/g, '_');
      resolve(new File([blob], `${base || 'plan'}.png`, { type: 'image/png' }));
    }, 'image/png');
  });
}

/**
 * Полный цикл: .sh3d → PNG-файл + метаданные этажа и помещений.
 * `layout` рисуется на canvas; канвас создаётся здесь, вся геометрия — в layout.
 */
export async function renderSh3dPlan(file: File, scene: Sh3dScene): Promise<RenderedPlan> {
  const layout = layoutPlan(scene);

  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas недоступен — конвертация .sh3d невозможна в этом браузере');
  }

  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, layout.width, layout.height);

  // Помещения → стены → подписи: стены должны перекрывать края комнат.
  for (const room of layout.rooms) {
    drawPolygon(context, room.polygon);
    context.fillStyle = COLORS.roomFill;
    context.fill();
    context.strokeStyle = COLORS.roomStroke;
    context.lineWidth = 1;
    context.stroke();
  }

  context.strokeStyle = COLORS.wall;
  context.lineCap = 'butt';
  for (const wall of layout.walls) {
    context.lineWidth = wall.thicknessPx;
    context.beginPath();
    context.moveTo(wall.x1, wall.y1);
    context.lineTo(wall.x2, wall.y2);
    context.stroke();
  }

  for (const room of layout.rooms) {
    drawRoomLabel(context, room);
  }

  const pngFile = await canvasToPngFile(canvas, file.name);
  return {
    file: pngFile,
    scale: layout.scale,
    width: layout.width,
    height: layout.height,
    rooms: layout.rooms.map(toImportRoom),
    typedRooms: layout.rooms.filter(hasFileType).length,
  };
}
