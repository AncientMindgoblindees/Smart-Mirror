import { describe, it, expect } from 'vitest';
import { getCameraErrorMessage } from './cameraErrors';

describe('getCameraErrorMessage', () => {
  it('maps permission denial', () => {
    const err = new DOMException('denied', 'NotAllowedError');
    expect(getCameraErrorMessage(err)).toContain('permission');
  });

  it('maps missing device', () => {
    const err = new DOMException('none', 'NotFoundError');
    expect(getCameraErrorMessage(err)).toContain('No camera');
  });

  it('maps generic Error', () => {
    expect(getCameraErrorMessage(new Error('fail'))).toBe('fail');
  });

  it('handles unknown', () => {
    expect(getCameraErrorMessage('x')).toBe('Could not open camera.');
  });
});
