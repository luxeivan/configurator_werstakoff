const ELLIPSIS = '…';

/**
 * Раскладывает подпись на строки, не выходя за прямоугольник.
 * Для SVG ширина символа оценивается по fontSize, для canvas можно передать measureText.
 */
export function layoutLabelLines(text, options = {}) {
  const value = String(text || '').trim();
  if (!value) return [];

  const fontSize = Math.max(1, Number(options.fontSize) || 8);
  const lineHeight = Math.max(1, Number(options.lineHeight) || fontSize * 1.2);
  const maxWidth = Math.max(1, Number(options.maxWidth) || fontSize * 8);
  const maxHeight = Math.max(lineHeight, Number(options.maxHeight) || lineHeight);
  const charWidth = Math.max(0.1, Number(options.charWidthRatio) || 0.66) * fontSize;
  const maxChars = Math.max(2, Math.floor(maxWidth / charWidth));
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const measureText = typeof options.measureText === 'function' ? options.measureText : null;
  const fits = (line) => (measureText ? measureText(line) <= maxWidth : line.length <= maxChars);

  const lines = [];
  let current = '';
  const flush = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };

  for (const word of value.split(/\s+/)) {
    let rest = word;
    const candidate = current ? `${current} ${rest}` : rest;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }

    flush();
    while (rest.length && !fits(rest)) {
      let take = Math.min(rest.length - 1, maxChars);
      if (measureText) {
        while (take > 1 && !fits(rest.slice(0, take))) take -= 1;
      }
      if (take < 1) take = 1;
      lines.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
    current = rest;
  }
  flush();

  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);
  let last = visible[maxLines - 1] || '';
  while (last.length && !fits(`${last}${ELLIPSIS}`)) last = last.slice(0, -1).trimEnd();
  visible[maxLines - 1] = `${last || ELLIPSIS.slice(0, Math.max(1, maxChars - 1))}${ELLIPSIS}`;
  return visible;
}
