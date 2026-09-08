import { describe, expect, it } from 'vitest';
import { allowedFingers } from '../src/core/keyboard';
import { orderedFingers, fingerBackground } from '../src/view/finger-colours';

describe('shared finger colours', () => {
  it('resolves the actual policy and keeps split colours in physical order', () => {
    expect(orderedFingers(allowedFingers('w', 'standard'))).toEqual(['left-ring']);
    expect(orderedFingers(allowedFingers('w', 'alternate'))).toEqual(['left-little']);
    const either = allowedFingers('w', 'either');
    expect(orderedFingers(either)).toEqual(['left-little', 'left-ring']);
    expect(either).toEqual(['left-ring', 'left-little']);
    expect(fingerBackground(either)).toBe(
      'linear-gradient(90deg,var(--left-little) 50%,var(--left-ring) 50%)',
    );
  });
  it('supports resolved profile assignments without needing a key or mode', () => {
    expect(orderedFingers(['right-thumb', 'left-thumb'])).toEqual(['left-thumb', 'right-thumb']);
    expect(fingerBackground(['right-ring'])).toBe('var(--right-ring)');
    expect(fingerBackground([])).toBe('transparent');
  });
});
