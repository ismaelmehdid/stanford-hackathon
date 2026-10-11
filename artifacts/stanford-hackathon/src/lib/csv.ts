/** Quote CSV fields and neutralize user-authored spreadsheet formulas. */
export function csvText(rows: string[][]) {
  const esc = (value: string) => {
    const safe = /^\s*[=+@]/.test(value) || /^\s*-(?!\d+(?:\.\d+)?(?:%| pp)?$)/.test(value)
      ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map(row => row.map(esc).join(',')).join('\r\n');
}

export function dl(filename: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
