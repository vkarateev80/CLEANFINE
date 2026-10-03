import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Sh3dParseError, parseHomeXml, polygonAreaM2, readSh3dScene } from './parseSh3d';

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

  it('мусорный XML → Sh3dParseError', () => {
    expect(() => parseHomeXml('это не xml <home>')).toThrow(Sh3dParseError);
  });

  it('xml без стен и помещений → Sh3dParseError', () => {
    expect(() => parseHomeXml('<?xml version="1.0"?><home version="1"/>')).toThrow(
      'В Home.xml нет ни стен, ни помещений',
    );
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
