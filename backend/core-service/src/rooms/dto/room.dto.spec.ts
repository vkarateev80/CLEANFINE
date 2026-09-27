import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateRoomDto } from './room.dto';

/** Дефект М2.7: очистка зоны уборки (`''` от web-admin и `null` от API-клиентов). */
describe('UpdateRoomDto.zone — очистка зоны', () => {
  it("'' очищает зону (так шлёт web-admin)", async () => {
    const dto = plainToInstance(UpdateRoomDto, { zone: '' });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.zone).toBe('');
  });

  it('null очищает зону (API-клиенты)', async () => {
    const dto = plainToInstance(UpdateRoomDto, { zone: null });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.zone).toBeNull();
  });

  it('непустая зона проходит', async () => {
    const dto = plainToInstance(UpdateRoomDto, { zone: 'A' });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.zone).toBe('A');
  });

  it('не-строка отклоняется', async () => {
    expect(await validate(plainToInstance(UpdateRoomDto, { zone: 42 }))).not.toEqual([]);
  });
});
