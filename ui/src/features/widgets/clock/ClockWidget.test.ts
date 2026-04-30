import { describe, expect, it } from 'vitest';
import { getClockDisplayParts } from './ClockWidget';

describe('getClockDisplayParts', () => {
  it('formats 24-hour values with leading zeros', () => {
    const parts = getClockDisplayParts(new Date(2026, 3, 19, 5, 7, 9), '24h');
    expect(parts).toMatchObject({
      hours: '05',
      minutes: '07',
      seconds: '09',
      meridiem: '',
      is12Hour: false,
    });
  });

  it('formats 12-hour values and meridiem', () => {
    const afternoon = getClockDisplayParts(new Date(2026, 3, 19, 13, 2, 3), '12h');
    expect(afternoon).toMatchObject({
      hours: '01',
      minutes: '02',
      seconds: '03',
      meridiem: 'PM',
      is12Hour: true,
    });

    const midnight = getClockDisplayParts(new Date(2026, 3, 19, 0, 15, 4), '12h');
    expect(midnight).toMatchObject({
      hours: '12',
      minutes: '15',
      seconds: '04',
      meridiem: 'AM',
      is12Hour: true,
    });
  });
});
