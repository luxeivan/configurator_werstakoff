import { describe, expect, it } from 'vitest';
import { layoutLabelLines } from './labels.js';

describe('layoutLabelLines', () => {
  it('переносит длинное название по словам', () => {
    const lines = layoutLabelLines('Тележка инструментальная TNC 795.4', {
      maxWidth: 48,
      maxHeight: 47,
      fontSize: 6,
      lineHeight: 7.2,
    });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toContain('Тележка');
  });

  it('обрезает подпись с многоточием, если строки не помещаются', () => {
    const lines = layoutLabelLines('Очень длинное название товара', {
      maxWidth: 12,
      maxHeight: 7,
      fontSize: 6,
      lineHeight: 7,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith('…')).toBe(true);
    expect(lines[0].length).toBeLessThanOrEqual(3);
  });

  it('разбивает длинное слово без пробелов', () => {
    const lines = layoutLabelLines('СУПЕРДЛИННОЕСЛОВО', {
      maxWidth: 24,
      maxHeight: 50,
      fontSize: 6,
      lineHeight: 7,
    });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= 6)).toBe(true);
  });

  it('использует measureText для точной ширины', () => {
    const lines = layoutLabelLines('abc def', {
      maxWidth: 25,
      maxHeight: 100,
      fontSize: 10,
      lineHeight: 12,
      measureText: (line) => line.length * 7,
    });
    expect(lines).toEqual(['abc', 'def']);
  });
});
