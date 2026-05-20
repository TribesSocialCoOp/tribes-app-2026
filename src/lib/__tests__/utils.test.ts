import { describe, it, expect } from 'vitest';
import { cleanUrl } from '../utils';

describe('cleanUrl', () => {
  it('should clean bold markdown link trailing characters', () => {
    expect(cleanUrl('https://www.govinfo.gov/app/details/PLAW-119publ12)**')).toBe(
      'https://www.govinfo.gov/app/details/PLAW-119publ12'
    );
  });

  it('should clean regular markdown link trailing parenthesis', () => {
    expect(cleanUrl('https://www.govinfo.gov/app/details/PLAW-119publ12)')).toBe(
      'https://www.govinfo.gov/app/details/PLAW-119publ12'
    );
  });

  it('should keep balanced parentheses in Wikipedia URLs', () => {
    expect(cleanUrl('https://en.wikipedia.org/wiki/Array_(data_structure)')).toBe(
      'https://en.wikipedia.org/wiki/Array_(data_structure)'
    );
  });

  it('should clean trailing unmatched markdown parentheses in Wikipedia URLs', () => {
    expect(cleanUrl('https://en.wikipedia.org/wiki/Array_(data_structure))')).toBe(
      'https://en.wikipedia.org/wiki/Array_(data_structure)'
    );
  });

  it('should clean trailing period', () => {
    expect(cleanUrl('https://google.com.')).toBe('https://google.com');
  });

  it('should clean trailing query exclamation mark', () => {
    expect(cleanUrl('https://google.com/search?q=test!')).toBe('https://google.com/search?q=test');
  });

  it('should clean trailing unmatched square bracket', () => {
    expect(cleanUrl('https://google.com/url_with_[brackets]]')).toBe(
      'https://google.com/url_with_[brackets]'
    );
  });

  it('should clean stacked formatting symbols', () => {
    expect(cleanUrl('https://google.com/path_with_some_**bold**_text_**')).toBe(
      'https://google.com/path_with_some_**bold**_text'
    );
  });
});
