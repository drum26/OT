import { fmtDate, fio, toApiDate, toDayjs } from './format';
import { qs } from '../api/client';

describe('форматирование', () => {
  it('дата без сдвига часового пояса', () => {
    expect(fmtDate('2026-03-05T00:00:00.000Z')).toBe('05.03.2026');
    expect(fmtDate('2026-12-31')).toBe('31.12.2026');
    expect(fmtDate(null)).toBe('');
  });
  it('преобразование дат для API', () => {
    expect(toApiDate(toDayjs('2026-01-31T00:00:00.000Z'))).toBe('2026-01-31');
    expect(toApiDate(null)).toBeNull();
  });
  it('ФИО', () => {
    expect(fio({ lastName: 'Иванов', firstName: 'Иван', middleName: null })).toBe('Иванов Иван');
  });
  it('параметры запроса: массивы через запятую, пустые отбрасываются', () => {
    expect(qs({ a: ['1', '2'], b: '', c: undefined, d: [], e: 0, f: false })).toEqual({ a: '1,2', e: '0', f: 'false' });
  });
});
