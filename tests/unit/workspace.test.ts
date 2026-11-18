import { describe, expect, it } from "vitest";
import {
  addColumn,
  addPage,
  addWidget,
  defaultLayout,
  duplicateColumn,
  duplicatePage,
  duplicateWidget,
  layoutSchema,
  mainColumnId,
  MAX_COLUMNS,
  moveApp,
  moveWidget,
  normalizePageNames,
  parseLayout,
  pastePage,
  removeColumn,
  removePage,
  renamePage,
  revertPageTheme,
  setPageTheme,
  updateColumn,
} from "@/lib/workspace";

const apps = ["assistant", "storage", "calendar"];
const home = () => defaultLayout(apps).pages[0];

describe("columns and widgets", () => {
  it("defaults to one Home page with two columns, built-in widgets and Garwin Blue", () => {
    const l = defaultLayout(apps);
    expect(l.pages).toHaveLength(1);
    expect(l.pages[0]).toMatchObject({ name: "Home", theme: "garwin-blue", previousTheme: null });
    expect(l.pages[0].columns).toHaveLength(2);
    expect(layoutSchema.safeParse(l).success).toBe(true);
  });

  it("adds a third column when needed, never a fourth", () => {
    let p = addColumn(home());
    expect(p.columns).toHaveLength(3);
    p = addColumn(p);
    expect(p.columns).toHaveLength(MAX_COLUMNS);
    expect(duplicateColumn(p, p.columns[0].id)).toBe(p);
  });

  it("duplicates a column with fresh widget ids", () => {
    const p = home();
    const d = duplicateColumn(p, p.columns[0].id);
    expect(d.columns).toHaveLength(3);
    expect(d.columns[1].widgets.map((w) => w.type)).toEqual(p.columns[0].widgets.map((w) => w.type));
    expect(d.columns[1].widgets[0].id).not.toBe(p.columns[0].widgets[0].id);
  });

  it("minimizes, renames and resizes columns; keeps at least one", () => {
    const p = home();
    const u = updateColumn(p, p.columns[0].id, { minimized: true, label: "Today", width: "wide" });
    expect(u.columns[0]).toMatchObject({ minimized: true, label: "Today", width: "wide" });
    const one = removeColumn(p, p.columns[0].id);
    expect(removeColumn(one, one.columns[0].id).columns).toHaveLength(1);
  });

  it("adds, duplicates and moves widgets between columns", () => {
    let p = home();
    const [a, b] = p.columns;
    p = addWidget(p, a.id, "todo", 0);
    expect(p.columns[0].widgets[0].type).toBe("todo");
    const id = p.columns[0].widgets[0].id;
    p = duplicateWidget(p, id);
    expect(p.columns[0].widgets[1].type).toBe("todo");
    p = moveWidget(p, id, b.id, 0);
    expect(p.columns[1].widgets[0].id).toBe(id);
    expect(p.columns[0].widgets.some((w) => w.id === id)).toBe(false);
  });

  it("puts the search bar and tool buttons on the widest column, the middle on a tie", () => {
    const p = home();
    expect(mainColumnId(p.columns)).toBe(p.columns[1].id); // the wide one
    const three = addColumn(updateColumn(p, p.columns[1].id, { width: "normal" }));
    expect(mainColumnId(three.columns)).toBe(three.columns[1].id);
    const minimized = updateColumn(p, p.columns[1].id, { minimized: true });
    expect(mainColumnId(minimized.columns)).toBe(p.columns[0].id);
  });
});

describe("pages", () => {
  it("adds blank pages, duplicates, pastes copies with fresh ids, renames and deletes", () => {
    let l = defaultLayout(apps);
    const added = addPage(l);
    l = added.layout;
    expect(l.pages).toHaveLength(2);
    expect(l.pages[1].name).toBe("Page 2");
    expect(l.pages[1].columns.every((c) => c.widgets.length === 0)).toBe(true);

    const dup = duplicatePage(l, l.pages[0].id);
    expect(dup.layout.pages[1].name).toBe("Home copy");
    expect(dup.layout.pages[1].columns[0].widgets[0].id).not.toBe(l.pages[0].columns[0].widgets[0].id);

    const pasted = pastePage(dup.layout, l.pages[0]);
    expect(pasted.layout.pages.at(-1)!.name).toBe("Home copy 2");
    expect(pastePage(l, { nonsense: true } as never).pageId).toBeNull();

    l = renamePage(pasted.layout, pasted.pageId!, "Projects");
    expect(l.pages.at(-1)!.name).toBe("Projects");
    expect(normalizePageNames(renamePage(l, l.pages[1].id, "  ")).pages[1].name).toBe("Page 2");

    l = removePage(l, l.pages[0].id);
    expect(l.pages[0].name).not.toBe("Home");
    let one = defaultLayout(apps);
    one = removePage(one, one.pages[0].id);
    expect(one.pages).toHaveLength(1);
  });

  it("themes are per page, with revert to last and to default", () => {
    let l = defaultLayout(apps);
    const id = l.pages[0].id;
    l = setPageTheme(l, id, "plum");
    l = setPageTheme(l, id, "forest");
    expect(l.pages[0]).toMatchObject({ theme: "forest", previousTheme: "plum" });
    l = revertPageTheme(l, id, "last");
    expect(l.pages[0].theme).toBe("plum");
    l = revertPageTheme(l, id, "default");
    expect(l.pages[0]).toMatchObject({ theme: "garwin-blue", previousTheme: "plum" });
    expect(setPageTheme(l, id, "evil")).toBe(l);
  });
});

describe("saved layouts", () => {
  it("reorders app icons and keeps new apps", () => {
    const l = moveApp(defaultLayout(apps), "calendar", 0);
    expect(l.appOrder).toEqual(["calendar", "assistant", "storage"]);
    expect(parseLayout(l, [...apps, "messages"]).appOrder).toEqual(["calendar", "assistant", "storage", "messages"]);
    expect(parseLayout(l, ["storage"]).appOrder).toEqual(["storage"]);
  });

  it("upgrades the one-page format and rejects broken layouts", () => {
    const p = home();
    const v1 = { version: 1, theme: "plum", columns: p.columns, appOrder: apps };
    const up = parseLayout(v1, apps);
    expect(up.pages).toHaveLength(1);
    expect(up.pages[0]).toMatchObject({ name: "Home", theme: "plum" });
    expect(parseLayout({ nonsense: true }, apps).pages).toHaveLength(1);
    const l = defaultLayout(apps);
    expect(layoutSchema.safeParse({ ...l, pages: [{ ...l.pages[0], columns: [...p.columns, ...p.columns] }] }).success).toBe(false);
  });
});
