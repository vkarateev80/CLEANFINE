import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateFloorDto } from './floor.dto';

/**
 * Дефект М2.7: очистка `planScale` через API. Раньше `''` превращался в 0 и
 * падал на @Min, а `null` тип не принимал — фронт вообще не шлёт поле.
 */
describe('UpdateFloorDto.planScale — очистка масштаба', () => {
  it('null очищает поле (проходит валидацию)', async () => {
    const dto = plainToInstance(UpdateFloorDto, { planScale: null });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.planScale).toBeNull();
  });

  it("'' (исторический формат старых клиентов) эквивалентен очистке", async () => {
    const dto = plainToInstance(UpdateFloorDto, { planScale: '' });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.planScale).toBeNull();
  });

  it('число проходит и сохраняется', async () => {
    const dto = plainToInstance(UpdateFloorDto, { planScale: '0.05' });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.planScale).toBeCloseTo(0.05);
  });

  it('ноль и мусор отклоняются', async () => {
    expect(await validate(plainToInstance(UpdateFloorDto, { planScale: 0 }))).not.toEqual([]);
    expect(await validate(plainToInstance(UpdateFloorDto, { planScale: 'abc' }))).not.toEqual([]);
  });

  it('отсутствие поля — не менять (undefined)', async () => {
    const dto = plainToInstance(UpdateFloorDto, {});
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.planScale).toBeUndefined();
  });
});
