import { sheetColumns, sheetNames, type SheetName } from "@/lib/storage/schema";

export type Row = Record<string, string>;

export class Workbook {
  private readonly tables = new Map<SheetName, Row[]>();

  static empty() {
    const book = new Workbook();
    for (const name of sheetNames) {
      book.tables.set(name, []);
    }
    return book;
  }

  static fromGrids(grids: Partial<Record<SheetName, string[][]>>) {
    const book = Workbook.empty();
    for (const name of sheetNames) {
      const grid = grids[name] ?? [];
      const columns = sheetColumns[name] as readonly string[];
      const header = grid[0] ?? [];
      const index = new Map(header.map((column, position) => [column, position]));
      const rows: Row[] = [];
      for (const line of grid.slice(1)) {
        if (line.every((cell) => cell.trim() === "")) {
          continue;
        }
        const row: Row = {};
        for (const column of columns) {
          const position = index.get(column);
          row[column] = position === undefined ? "" : (line[position] ?? "");
        }
        rows.push(row);
      }
      book.tables.set(name, rows);
    }
    return book;
  }

  clone() {
    const copy = Workbook.empty();
    for (const name of sheetNames) {
      copy.tables.set(
        name,
        this.rows(name).map((row) => ({ ...row }))
      );
    }
    return copy;
  }

  rows(name: SheetName) {
    return this.tables.get(name) ?? [];
  }

  find(name: SheetName, column: string, value: string) {
    return this.rows(name).find((row) => row[column] === value) ?? null;
  }

  insert(name: SheetName, row: Row) {
    const columns = sheetColumns[name] as readonly string[];
    const stored: Row = {};
    for (const column of columns) {
      stored[column] = row[column] ?? "";
    }
    this.tables.set(name, [...this.rows(name), stored]);
  }

  replace(name: SheetName, id: string, patch: Row) {
    this.updateWhere(name, "id", id, patch);
  }

  updateWhere(name: SheetName, column: string, value: string, patch: Row) {
    const columns = new Set(Object.keys(this.rows(name)[0] ?? patch));
    this.tables.set(
      name,
      this.rows(name).map((row) => {
        if (row[column] !== value) {
          return row;
        }
        const next = { ...row, ...patch };
        if (column === "id") {
          next.id = row.id;
        }
        for (const key of Object.keys(next)) {
          columns.add(key);
        }
        return next;
      })
    );
  }

  toGrids(): Record<SheetName, string[][]> {
    const grids = {} as Record<SheetName, string[][]>;
    for (const name of sheetNames) {
      const columns = [...sheetColumns[name]];
      grids[name] = [columns, ...this.rows(name).map((row) => columns.map((column) => row[column] ?? ""))];
    }
    return grids;
  }
}
