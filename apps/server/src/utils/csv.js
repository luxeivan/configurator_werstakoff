// Минимальный CSV-парсер: кавычки, экранирование, CRLF/LF, BOM.
// Возвращает массив объектов с ключами из шапки.
export function parseCsv(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  let last = null; // последний значимый символ ('\r', '\n', ',', '"' или null)

  function pushField() {
    row.push(field);
    field = '';
  }
  function pushRow() {
    if (row.length) rows.push(row);
    row = [];
  }

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      last = char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      last = char;
      continue;
    }
    if (char === ',') {
      pushField();
      last = char;
      continue;
    }
    if (char === '\n') {
      pushField();
      pushRow();
      last = char;
      continue;
    }
    if (char === '\r') {
      // CR только внутри CRLF — игнорируем; следующий \n завершит строку
      last = char;
      continue;
    }
    field += char;
    last = char;
  }
  if (last === '\n' && rows.length) {
    // файл уже закончился переводом строки — финальная строка уже добавлена
  } else {
    pushField();
    pushRow();
  }

  const header = rows[0] || [];
  const data = [];
  for (let index = 1; index < rows.length; index += 1) {
    const item = {};
    for (let column = 0; column < header.length; column += 1) {
      item[header[column].trim()] = (rows[index][column] ?? '').trim();
    }
    data.push(item);
  }
  return data;
}
