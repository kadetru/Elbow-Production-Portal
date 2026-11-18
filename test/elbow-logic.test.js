// Run: node --test test
const test = require("node:test"), assert = require("node:assert");
const L = require("../elbow-logic.js");

const v = value => ({ mark: "value", value }), carry = { mark: "carry" }, blank = { mark: "blank" };
const hour = (i, o) => ({ hour: L.HOURS[i], standard: "", total: { value: null }, diameter: blank, wall: blank, radius: blank, degree: blank, order: blank,
  pcs: { value: null }, rejects: { value: null }, ...o });

test("one bender shift becomes one row per item and SO run", () => {
  const rows = L.HOURS.map((_, i) => hour(i, {}));
  rows[0] = hour(0, { diameter: v("4"), standard: "IPS", wall: v("SW"), radius: v("36"), degree: { ...v("90"), how: "written" },
                      order: v("135395"), pcs: { value: 8 }, rejects: { value: 1 } });
  rows[1] = hour(1, { diameter: carry, wall: carry, radius: carry, degree: carry, order: carry, pcs: { value: 9 }, rejects: { value: 0 } });
  rows[2] = hour(2, { diameter: carry, wall: carry, radius: carry, degree: carry, order: v("135400"), pcs: { value: 5 }, rejects: { value: 0 } });
  const [rep] = L.buildReports("xl1", "log.xlsx", 1, { bender: "3", sections: [{ shift: 1, date: "2026-11-02", rows }] });
  L.resolve(rep, new Set(["40CSW92P"]), new Set(), "2026-11-02");

  assert.deepStrictEqual(L.blocking(rep), []);
  assert.deepStrictEqual(rep.rows.map(r => [r.item, r.so, r.units, r.rej, r.start, r.end]), [
    ["40CSW92P", "SO135395", 17, 1, "05:00", "07:00"],     // check marks carry the specs and SO down
    ["40CSW92P", "SO135400", 5, 0, "07:00", "08:00"],      // a new SO starts a new row
  ]);
});
