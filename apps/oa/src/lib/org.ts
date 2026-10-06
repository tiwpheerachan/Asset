/**
 * สายบังคับบัญชา — ใครเป็นหัวหน้าโดยตรงของใคร
 *
 * ที่มา: สิทธิ์การมองเห็นเดิมผูกกับ "แผนกเดียวกัน" ซึ่งตอบไม่ได้สองกรณีที่เกิดจริง
 * — หัวหน้าที่คุมคนข้ามแผนก และหัวหน้าของหัวหน้าอีกชั้นหนึ่ง
 *
 * ที่สำคัญกว่านั้นคือมันแก้ปัญหาคนละแบบกับการ "แท็กให้เห็นทีละใบ" ซึ่งทำให้สิทธิ์
 * กลายเป็นผลพลอยได้จากความจำของคนกรอก และย้อนดูของเก่าไม่ได้เลยถ้าตอนนั้นลืมแท็ก
 * ผูกกับสายบังคับบัญชาแทน หัวหน้าจึงเห็นย้อนหลังได้ทุกใบตั้งแต่แรกโดยไม่ต้องขอใคร
 */

export type OrgEdge = {
  id: number;
  /** หัวหน้าโดยตรง — null = ไม่ได้ระบุ (เช่นระดับบนสุด) */
  manager_id: number | null;
};

/**
 * ทุกคนที่อยู่ใต้บังคับบัญชาของคนนี้ ทั้งทางตรงและทางอ้อม
 *
 * ไล่ลงทีละชั้นและจำคนที่นับไปแล้ว — ข้อมูลที่กรอกด้วยมือวนเป็นวงกลมได้เสมอ
 * (A เป็นหัวหน้า B, B เป็นหัวหน้า A) ถ้าไม่กันไว้จะวนไม่จบและหน้าค้างทั้งระบบ
 */
export function subordinateIds(edges: OrgEdge[], managerId: number): number[] {
  const children = new Map<number, number[]>();
  for (const e of edges) {
    if (e.manager_id === null) continue;
    const list = children.get(e.manager_id) ?? [];
    list.push(e.id);
    children.set(e.manager_id, list);
  }

  const found = new Set<number>();
  const queue = [managerId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const child of children.get(cur) ?? []) {
      // ตัวเองไม่นับเป็นลูกน้องตัวเอง แม้ข้อมูลจะวนกลับมาหาตัวเอง
      if (child === managerId || found.has(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return [...found];
}

/** คนนี้เป็นหัวหน้าของใครสักคนไหม — ใช้ตัดสินว่าจะโชว์แท็บ "ทีมของฉัน" ไหม */
export function hasSubordinates(edges: OrgEdge[], managerId: number): boolean {
  return subordinateIds(edges, managerId).length > 0;
}

/**
 * ตั้งคนนี้เป็นหัวหน้าของคนนั้นได้ไหม
 *
 * ห้ามตั้งตัวเองเป็นหัวหน้าตัวเอง และห้ามตั้งลูกน้อง (ไม่ว่าชั้นไหน) เป็นหัวหน้า
 * เพราะจะเกิดวงกลมในสายบังคับบัญชา ซึ่งอ่านเป็นผังองค์กรไม่ได้และทำให้การไล่สิทธิ์
 * ไม่มีจุดจบ — กันตั้งแต่ตอนบันทึกดีกว่าไปกันตอนไล่ทีหลัง
 */
export function canBeManager(edges: OrgEdge[], userId: number, managerId: number): boolean {
  if (userId === managerId) return false;
  return !subordinateIds(edges, userId).includes(managerId);
}
