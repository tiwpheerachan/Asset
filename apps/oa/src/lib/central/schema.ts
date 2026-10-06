/**
 * สิ่งที่แอปนี้ประกาศให้ Central Login รู้จัก
 *
 * ตัวข้อมูลจริงอยู่ใน schema.json เพื่อให้สคริปต์ deploy (node ล้วน) กับโค้ดแอป (TS)
 * อ่านจากที่เดียวกัน — ประกาศไว้อย่างหนึ่งแล้วเช็คอีกอย่างหนึ่งคือบั๊กที่หาไม่เจอ
 */
import raw from "./schema.json";

export type CentralResourceDef = {
  key: string;
  name: string;
  rtype: string;
  parent?: string;
  sensitive?: boolean;
};

export type CentralCapabilityDef = { key: string; name: string };

export const CENTRAL_RESOURCES = raw.resources as CentralResourceDef[];
export const CENTRAL_CAPABILITY_DEFS = raw.capabilities as CentralCapabilityDef[];

export const CENTRAL_RESOURCE_KEYS = CENTRAL_RESOURCES.map((r) => r.key);
export const CENTRAL_CAPABILITIES = CENTRAL_CAPABILITY_DEFS.map((c) => c.key);

/** ชนิดของคีย์ — กันพิมพ์ผิดตอนเรียก mayDo() */
export type CentralResource = (typeof CENTRAL_RESOURCE_KEYS)[number];
export type CentralCapability = (typeof CENTRAL_CAPABILITIES)[number];
