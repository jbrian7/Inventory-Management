export function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

export function csvDocument(header: string[], rows: unknown[][]) {
  return [csvRow(header), ...rows.map((row) => csvRow(row))].join("\r\n") + "\r\n";
}
