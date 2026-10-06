const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { mapRole } = require("../.test-build/lib/sso/provision.js");
const { roleFromPerms } = require("../.test-build/lib/central/role.js");

/** ค่าตั้งต้นแบบเดียวกับที่ ssoConfig() สร้าง แต่ระบุตรงๆ ให้เทสต์อ่านออก */
const cfg = (over = {}) => ({
  roleMap: {
    admin: "ADMIN",
    administrator: "ADMIN",
    owner: "ADMIN",
    manager: "MANAGER",
    lead: "MANAGER",
    head: "MANAGER",
    editor: "USER",
    viewer: "USER",
    user: "USER",
    member: "USER",
  },
  defaultRole: "USER",
  ...over,
});

/**
 * การแมปบทบาทคือด่านสุดท้ายที่ตัดสินว่าใครแก้ฟอร์ม สายอนุมัติ และสิทธิ์คนอื่นได้
 * พลาดตรงนี้ไม่มีอะไรฟ้อง — คนที่ได้เกินก็แค่ใช้งานได้มากกว่าที่ควร โดยไม่มีใครสังเกต
 */
describe("แปลงบทบาทจากระบบกลางเป็นสิทธิ์ในแอป", () => {
  test("owner กับ admin เป็นผู้ดูแลระบบ", async () => {
    assert.equal(mapRole(["owner"], cfg()), "ADMIN");
    assert.equal(mapRole(["admin"], cfg()), "ADMIN");
    assert.equal(mapRole(["administrator"], cfg()), "ADMIN");
  });

  test("editor ต้องไม่ใช่ผู้ดูแลระบบ — แก้ข้อมูลได้ ไม่ใช่ดูแลระบบได้", async () => {
    assert.equal(mapRole(["editor"], cfg()), "USER");
  });

  test("editor ไม่เลื่อนขั้นตามค่าเริ่มต้นที่ตั้งไว้สูง", async () => {
    assert.equal(mapRole(["editor"], cfg({ defaultRole: "MANAGER" })), "USER");
  });

  test("บทบาทที่ไม่รู้จักตกไปใช้ค่าเริ่มต้น", async () => {
    assert.equal(mapRole(["something_new"], cfg()), "USER");
    assert.equal(mapRole([], cfg()), "USER");
  });

  test("ถือหลายบทบาทพร้อมกัน ให้ยึดอันที่สูงสุด", async () => {
    assert.equal(mapRole(["viewer", "owner"], cfg()), "ADMIN");
    assert.equal(mapRole(["editor", "manager"], cfg()), "MANAGER");
  });

  test("ตัวพิมพ์ใหญ่เล็กไม่มีผล", async () => {
    assert.equal(mapRole(["Owner"], cfg()), "ADMIN");
    assert.equal(mapRole(["EDITOR"], cfg()), "USER");
  });
});

describe("แปลงสิทธิ์จากชั้น authz เป็นบทบาทในแอป", () => {
  const perms = (over = {}) => ({
    hasAccess: true,
    roles: [],
    base_level: "view",
    can_share: false,
    resources: {},
    capabilities: [],
    masked_fields: [],
    scopes: {},
    grants_version: "x",
    ...over,
  });

  test("จัดการผู้ใช้ได้ = ผู้ดูแลระบบ", async () => {
    assert.equal(roleFromPerms(perms({ resources: { users: "manage" } })), "ADMIN");
    assert.equal(roleFromPerms(perms({ base_level: "manage" })), "ADMIN");
  });

  test("ระดับ edit ยังไม่ใช่ผู้ดูแลระบบ", async () => {
    assert.equal(roleFromPerms(perms({ base_level: "edit" })), "USER");
  });

  test("override ที่ปิด users ทับระดับพื้นฐาน manage", async () => {
    assert.equal(
      roleFromPerms(perms({ base_level: "manage", resources: { users: "none" } })),
      "USER",
    );
  });

  test("ความสามารถ team.view = หัวหน้าทีม", async () => {
    assert.equal(roleFromPerms(perms({ capabilities: ["team.view"] })), "MANAGER");
  });

  test("ไม่มีอะไรเลย = ผู้ใช้ทั่วไป", async () => {
    assert.equal(roleFromPerms(perms()), "USER");
  });
});
