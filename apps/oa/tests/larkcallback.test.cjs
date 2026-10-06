const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { parseCardCallback, cardReply } = require("../.test-build/lib/lark/callback.js");

const VALUE = { act: "APPROVE", ap: 42, req: 7 };

/** แบบเดิม — Message Card Request URL */
const v1 = (value = VALUE, openId = "ou_abc") => ({
  open_id: openId,
  token: "tok",
  action: { tag: "button", value },
});

/** แบบใหม่ — event card.action.trigger */
const v2 = (value = VALUE, openId = "ou_abc") => ({
  schema: "2.0",
  header: { event_type: "card.action.trigger", token: "tok" },
  event: { operator: { open_id: openId }, action: { tag: "button", value } },
});

describe("แกะการกดปุ่มบนการ์ด Lark", () => {
  test("อ่านแบบเดิมได้", async () => {
    assert.deepEqual(parseCardCallback(v1()), {
      act: "APPROVE", ap: 42, req: 7, to: 0, openId: "ou_abc", v2: false,
    });
  });

  /**
   * นี่คือสาเหตุที่กดอนุมัติแล้ว "ไม่มีอะไรเกิดขึ้น" — โค้ดเดิมอ่านเฉพาะแบบเดิม
   * พอได้แบบใหม่ก็ตอบ 200 เปล่า ๆ ไม่มีแม้แต่ข้อความบอกว่าพลาด
   */
  test("อ่านแบบใหม่ (card.action.trigger) ได้ด้วย", async () => {
    assert.deepEqual(parseCardCallback(v2()), {
      act: "APPROVE", ap: 42, req: 7, to: 0, openId: "ou_abc", v2: true,
    });
  });

  test("value ที่ส่งมาเป็นสตริง JSON ก็อ่านได้", async () => {
    const body = v2(JSON.stringify(VALUE));
    assert.equal(parseCardCallback(body)?.req, 7);
  });

  test("ปุ่ม 'เปิดในระบบ' ไม่ใช่การตัดสินใจ — ต้องไม่ถูกตีความว่ากดอนุมัติ", async () => {
    assert.equal(parseCardCallback(v1({ act: "OPEN", ap: 42, req: 7 })), null);
  });

  test("ไม่รู้ว่าใครกด = ทำอะไรไม่ได้", async () => {
    assert.equal(parseCardCallback(v1(VALUE, "")), null);
  });

  test("เลขเอกสารหรือเลขขั้นเพี้ยน = ไม่แตะข้อมูล", async () => {
    assert.equal(parseCardCallback(v1({ act: "APPROVE", ap: 0, req: 7 })), null);
    assert.equal(parseCardCallback(v1({ act: "APPROVE", ap: 42, req: "abc" })), null);
  });

  test("ปุ่มถ่ายโอนสองจังหวะ — จังหวะแรกยังไม่มีตัวคน จังหวะสองต้องมี", async () => {
    assert.equal(parseCardCallback(v1({ act: "TRANSFER", ap: 42, req: 7 }))?.act, "TRANSFER");
    assert.equal(parseCardCallback(v2({ act: "TRANSFER_TO", ap: 42, req: 7, to: 9 }))?.to, 9);
  });

  /** ถ้าไม่รู้ว่าจะโอนให้ใคร การโอนมั่วอันตรายกว่าการไม่ทำอะไร */
  test("เลือกชื่อแล้วแต่ไม่รู้ว่าชื่อไหน = ไม่โอน", async () => {
    assert.equal(parseCardCallback(v1({ act: "TRANSFER_TO", ap: 42, req: 7 })), null);
    assert.equal(parseCardCallback(v1({ act: "TRANSFER_TO", ap: 42, req: 7, to: 0 })), null);
  });

  test("ปุ่มยกเลิกในหน้าจอเลือกคนก็ต้องอ่านได้", async () => {
    assert.equal(parseCardCallback(v1({ act: "CANCEL", ap: 42, req: 7 }))?.act, "CANCEL");
  });

  test("event อื่นที่ไม่ใช่การกดปุ่ม ไม่ทำให้พัง", async () => {
    assert.equal(parseCardCallback({}), null);
    assert.equal(parseCardCallback({ type: "url_verification", challenge: "x" }), null);
  });
});

describe("รูปแบบคำตอบที่ส่งกลับให้ Lark", () => {
  const toast = { type: "success", content: "อนุมัติแล้ว" };
  const card = { header: {} };

  /** ส่งผิดแบบ = การ์ดไม่ถูกแทนที่ ปุ่มค้างอยู่ทั้งที่อนุมัติไปแล้ว แล้วคนก็กดซ้ำ */
  test("แบบใหม่ต้องห่อการ์ดไว้ใน raw", async () => {
    assert.deepEqual(cardReply(true, toast, card), {
      toast, card: { type: "raw", data: card },
    });
  });

  test("แบบเดิมส่งการ์ดตรง ๆ", async () => {
    assert.deepEqual(cardReply(false, toast, card), { toast, card });
  });

  test("ไม่มีการ์ดใหม่ก็ส่งแค่ toast", async () => {
    assert.deepEqual(cardReply(true, toast), { toast });
  });
});
