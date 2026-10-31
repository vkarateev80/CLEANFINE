import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { layoutPlan } from './planLayout';
import { toImportRoom } from './renderPlan';
import {
  SECTORS_LEVEL_NAME,
  Sh3dParseError,
  parseHomeXml,
  polygonAreaM2,
  readPlanXml,
  readSh3dScene,
} from './parseSh3d';

/** Минимальная сцена: 2 стены, прямоугольная комната 400×300 см (12 м²) и безымянная. */
const FIXTURE_XML = `<?xml version='1.0'?>
<home version='7400' name='test' wallHeight='1600.0'>
  <wall id='w1' xStart='0' yStart='0' xEnd='1000' yEnd='0' thickness='10'/>
  <wall id='w2' xStart='0' yStart='0' xEnd='0' yEnd='800' thickness='20'/>
  <room id='r1' name='Кабинет 101'>
    <point x='0' y='0'/>
    <point x='400' y='0'/>
    <point x='400' y='300'/>
    <point x='0' y='300'/>
  </room>
  <room id='r2'>
    <point x='500' y='0'/>
    <point x='600' y='0'/>
    <point x='600' y='100'/>
    <point x='500' y='100'/>
  </room>
  <room id='r-broken'>
    <point x='10' y='10'/>
    <point x='20' y='20'/>
  </room>
</home>`;

describe('parseHomeXml', () => {
  it('разбирает стены и помещения, вырожденный контур отбрасывает', () => {
    const scene = parseHomeXml(FIXTURE_XML);
    expect(scene.walls).toHaveLength(2);
    expect(scene.rooms).toHaveLength(2);
    expect(scene.rooms.map((room) => room.name)).toEqual(['Кабинет 101', '']);
  });

  it('считает площадь по контуру (Шейл) в м²', () => {
    const scene = parseHomeXml(FIXTURE_XML);
    expect(scene.rooms[0].areaM2).toBeCloseTo(12, 5);
    expect(scene.rooms[1].areaM2).toBeCloseTo(1, 5);
  });

  it('границы охватывают и стены, и помещения', () => {
    const scene = parseHomeXml(FIXTURE_XML);
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 800 });
  });

  it('толщина стены берётся из атрибута', () => {
    const scene = parseHomeXml(FIXTURE_XML);
    expect(scene.walls[1].thickness).toBe(20);
  });

  it('свойства «Планировщика 3D»: roomType → type, heightCm → число, прочие игнорируются', () => {
    const xml = `<?xml version='1.0'?>
<home version='7400'>
  <room id='k' name='Кухня 1'>
    <property name='roomType' value='Кухня'/>
    <property name='areaM2' value='30'/>
    <property name='perimeterM' value='22'/>
    <property name='heightCm' value='250'/>
    <property name='cleanZone' value='Зелёная зона'/>
    <property name='custom' value='что-то'/>
    <point x='0' y='0'/><point x='400' y='0'/><point x='400' y='300'/><point x='0' y='300'/>
  </room>
  <room id='plain' name='Без свойств'>
    <point x='500' y='0'/><point x='600' y='0'/><point x='600' y='100'/><point x='500' y='100'/>
  </room>
  <room id='bad' name='Кривая высота'>
    <property name='roomType' value='  Санузел  '/>
    <property name='heightCm' value='высокий'/>
    <point x='700' y='0'/><point x='800' y='0'/><point x='800' y='100'/><point x='700' y='100'/>
  </room>
</home>`;
    const scene = parseHomeXml(xml);
    const [kitchen, plain, bad] = scene.rooms;
    expect(kitchen.type).toBe('Кухня');
    expect(kitchen.heightCm).toBe(250);
    // Площадь — по контуру, а не из свойства areaM2.
    expect(kitchen.areaM2).toBeCloseTo(12, 5);
    expect(kitchen).not.toHaveProperty('cleanZone');
    expect(plain.type).toBeUndefined();
    expect(plain.heightCm).toBeUndefined();
    expect(bad.type).toBe('Санузел');
    expect(bad.heightCm).toBeUndefined();
  });

  it('мусорный XML → Sh3dParseError', () => {
    expect(() => parseHomeXml('это не xml <home>')).toThrow(Sh3dParseError);
  });

  it('xml без стен и помещений → Sh3dParseError', () => {
    expect(() => parseHomeXml('<?xml version="1.0"?><home version="1"/>')).toThrow(
      'В Home.xml нет ни стен, ни помещений',
    );
  });
});

describe('уровень «Секторы уборки» (31.10.2026)', () => {
  const SECTORS_XML = `<?xml version='1.0'?>
<home version='7400'>
  <level id='l0' name='Уровень 0' elevationIndex='0'/>
  <level id='ls' name='${SECTORS_LEVEL_NAME}' elevationIndex='1'/>
  <wall id='w1' level='l0' xStart='0' yStart='0' xEnd='1000' yEnd='0' thickness='10'/>
  <wall id='w2' level='l0' xStart='0' yStart='0' xEnd='0' yEnd='500' thickness='10'/>
  <room id='r1' level='l0' name='Кабинет'>
    <point x='0' y='0'/><point x='400' y='0'/><point x='400' y='300'/><point x='0' y='300'/>
  </room>
  <room id='s1' level='ls' name='Сектор 1'>
    <point x='-5000' y='-5000'/><point x='9000' y='-5000'/><point x='9000' y='9000'/><point x='-5000' y='9000'/>
  </room>
</home>`;

  it('контуры секторов не становятся помещениями и не расширяют bounds', () => {
    const scene = parseHomeXml(SECTORS_XML);
    expect(scene.rooms.map((room) => room.name)).toEqual(['Кабинет']);
    expect(scene.cleaningSectors.map((room) => room.name)).toEqual(['Сектор 1']);
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 500 });
  });

  it('без такого уровня cleaningSectors пуст', () => {
    expect(parseHomeXml(FIXTURE_XML).cleaningSectors).toEqual([]);
  });

  it('помещение другого уровня с похожим именем не считается сектором', () => {
    const scene = parseHomeXml(SECTORS_XML.replace("name='Кабинет'", "name='Сектор 9'"));
    expect(scene.rooms.map((room) => room.name)).toEqual(['Сектор 9']);
  });
});

describe('«ЗИЛ — 4 этаж (рабочий).sh3d»: 90 помещений, 7 секторов, 436 стен', () => {
  // Home.xml рабочего плана (исходник + уровни «Секторы уборки» и «Красная и лифтовая
  // зоны», SHA-1 файла 752cab12) в zip без 3D-моделей. Первые 63 помещения — исходные,
  // далее 20 санузлов и 7 лифтовых холлов: они помещения намеренно (у них есть прямоугольник).
  const fixture = readFileSync(
    join(process.cwd(), 'src/pages/Floors/sh3d/__fixtures__/zil-floor4-sectors.sh3d'),
  );
  const load = () => readSh3dScene(new File([fixture], 'zil-floor4.sh3d'));

  it('считает помещения, секторы и стены', async () => {
    const scene = await load();
    expect(scene.rooms).toHaveLength(90);
    expect(scene.rooms.slice(63).filter((room) => room.name.startsWith('Санузел'))).toHaveLength(
      20,
    );
    expect(
      scene.rooms.slice(63).filter((room) => room.name.startsWith('Лифтовый холл')),
    ).toHaveLength(7);
    expect(scene.cleaningSectors.map((room) => room.name)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => `Сектор ${n}`),
    );
    expect(scene.walls).toHaveLength(436);
    expect(scene.rooms.some((room) => /^Сектор \d$/.test(room.name))).toBe(false);
  });

  it('номера: у 29 помещений, «401/403» и «411/412» собраны из двух подписей', async () => {
    const scene = await load();
    const numbered = scene.rooms.filter((room) => room.number);
    expect(numbered).toHaveLength(29);
    expect(numbered.every((room) => scene.rooms.indexOf(room) < 63)).toBe(true);
    const byName = (name: string) => scene.rooms.filter((room) => room.name === name);
    expect(byName('ГД')[0].number).toBe('407');
    expect(scene.rooms.find((room) => room.number === '401/403')).toBeDefined();
    expect(scene.rooms.find((room) => room.number === '411/412')?.name).toBe('НАБ');
  });

  it('площадь импорта — по контуру: сумма 63 исходных помещений ≈ 1530,6 м², а не 1612,4 по прямоугольникам', async () => {
    const scene = await load();
    const total = layoutPlan(scene)
      .rooms.slice(0, 63)
      .reduce((sum, room) => sum + room.areaM2, 0);
    expect(total).toBeCloseTo(1530.6, 0);
    const kadry = layoutPlan(scene).rooms.find((room) => room.name === 'кадры');
    expect(kadry?.areaM2).toBeCloseTo(98.9, 0);
  });

  it('границы и масштаб плана считаются по стенам и помещениям, без секторов', async () => {
    const scene = await load();
    const { bounds } = scene;
    const sectorPoints = scene.cleaningSectors.flatMap((sector) => sector.points);
    // Контуры секторов шире этажа: попади они в bounds, масштаб плана сдвинулся бы.
    expect(Math.min(...sectorPoints.map((p) => p.x))).toBeLessThan(bounds.minX);

    const walls = scene.walls.flatMap((w) => [
      { x: w.xStart, y: w.yStart },
      { x: w.xEnd, y: w.yEnd },
    ]);
    const points = [...walls, ...scene.rooms.flatMap((room) => room.points)];
    expect(bounds.minX).toBe(Math.min(...points.map((p) => p.x)));
    expect(bounds.maxX).toBe(Math.max(...points.map((p) => p.x)));
    expect(bounds.minY).toBe(Math.min(...points.map((p) => p.y)));
    expect(bounds.maxY).toBe(Math.max(...points.map((p) => p.y)));

    const layout = layoutPlan(scene);
    expect(layout.rooms).toHaveLength(90);
  });
});

describe('номера кабинетов из подписей (31.10.2026)', () => {
  const room = (id: string, name: string, x0: number, x1: number) =>
    `<room id='${id}' name='${name}'><point x='${x0}' y='0'/><point x='${x1}' y='0'/><point x='${x1}' y='300'/><point x='${x0}' y='300'/></room>`;
  const label = (text: string, x: number, y = 100) =>
    `<label x='${x}' y='${y}'><textStyle fontSize='20'/><text>${text}</text></label>`;

  it('подпись внутри контура становится number; несколько — по возрастанию через «/»', () => {
    const scene = parseHomeXml(
      `<home>${room('a', 'ГД', 0, 400)}${room('b', '', 500, 900)}${room('c', 'Без номера', 1000, 1400)}` +
        label('407', 200) +
        label('403', 600) +
        label('401', 700) +
        label('Главное фойе', 1200) +
        label('455', 5000) +
        `</home>`,
    );
    expect(scene.rooms.map((r) => r.number)).toEqual(['407', '401/403', undefined]);
  });

  it('подпись относится к самому малому контуру из вложенных', () => {
    const scene = parseHomeXml(
      `<home>${room('outer', 'Зал', 0, 1000)}${room('inner', 'Кабинет', 100, 300)}${label('412', 200)}</home>`,
    );
    expect(scene.rooms.map((r) => r.number)).toEqual([undefined, '412']);
  });

  it('подпись не уходит в контур другого уровня (санузел внутри кабинета на уровне зон)', () => {
    const scene = parseHomeXml(
      `<home><level id='a' name='План'/><level id='z' name='Красная и лифтовая зоны'/>` +
        `<room id='r' level='a' name='Комната отдыха'><point x='0' y='0'/><point x='400' y='0'/><point x='400' y='300'/><point x='0' y='300'/></room>` +
        `<room id='wc' level='z' name='Санузел 4.09'><point x='100' y='50'/><point x='200' y='50'/><point x='200' y='150'/><point x='100' y='150'/></room>` +
        `<label level='a' x='150' y='100'><text>405</text></label></home>`,
    );
    expect(scene.rooms.map((room) => room.number)).toEqual(['405', undefined]);
  });

  it('номер идёт в начало имени при импорте, безымянное получает «Помещение N»', () => {
    const scene = parseHomeXml(
      `<home>${room('a', 'ГД', 0, 400)}${room('b', '', 500, 900)}${label('407', 200)}${label('402', 600)}</home>`,
    );
    const names = layoutPlan(scene).rooms.map((r, i) => toImportRoom(r, i).name);
    expect(names).toEqual(['407 ГД', '402 Помещение 2']);
  });
});

describe('polygonAreaM2', () => {
  it('вырожденный контур → 0', () => {
    expect(
      polygonAreaM2([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(0);
  });
});

describe('readSh3dScene', () => {
  async function fixtureFile(entries: Record<string, string>): Promise<File> {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(entries)) {
      zip.file(name, content);
    }
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    return new File([bytes], 'fixture.sh3d', { type: 'application/octet-stream' });
  }

  it('читает Home.xml из zip-архива', async () => {
    const file = await fixtureFile({ 'Home.xml': FIXTURE_XML });
    const scene = await readSh3dScene(file);
    expect(scene.rooms).toHaveLength(2);
  });

  it('не-архив → понятная ошибка', async () => {
    const file = new File(['просто текст'], 'fake.sh3d');
    await expect(readSh3dScene(file)).rejects.toThrow('не читается как .sh3d');
  });

  it('архив без Home.xml → понятная ошибка', async () => {
    const file = await fixtureFile({ 'readme.txt': 'нет сцены' });
    await expect(readSh3dScene(file)).rejects.toThrow('нет Home.xml');
  });
});

describe('readPlanXml (12.10.2026)', () => {
  it('Home.xml без архива разбирается как сцена Sweet Home 3D', async () => {
    const xml =
      '<?xml version="1.0"?><home><wall xStart="0" yStart="0" xEnd="400" yEnd="0" thickness="10"/>' +
      '<room name="Холл"><point x="0" y="0"/><point x="400" y="0"/><point x="400" y="300"/><point x="0" y="300"/></room></home>';
    const parsed = await readPlanXml(new File([xml], 'Home.xml', { type: 'text/xml' }));
    expect(parsed.kind).toBe('home');
    if (parsed.kind === 'home') {
      expect(parsed.scene.walls).toHaveLength(1);
      expect(parsed.scene.rooms).toHaveLength(1);
    }
  });

  it('SVG с расширением .xml превращается в файл image/svg+xml', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    const parsed = await readPlanXml(new File([svg], 'plan.xml', { type: 'application/xml' }));
    expect(parsed.kind).toBe('svg');
    if (parsed.kind === 'svg') {
      expect(parsed.file.name).toBe('plan.svg');
      expect(parsed.file.type).toBe('image/svg+xml');
    }
  });

  it('посторонний XML отклоняется с понятным сообщением', async () => {
    await expect(
      readPlanXml(new File(['<catalog><item/></catalog>'], 'data.xml', { type: 'text/xml' })),
    ).rejects.toThrow(/не распознан/);
  });
});
