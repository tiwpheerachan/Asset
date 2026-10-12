/**
 * Barcode 1 มิติ แบบ Code 128 (subset B) เรนเดอร์เป็น SVG ล้วน — ไม่พึ่งไลบรารีภายนอก
 * จึงทำงานได้ทั้งฝั่ง server/client, คมชัดตอนพิมพ์ (vector) และยืดเต็มความกว้างได้
 *
 * Code 128B รองรับ ASCII 32–126 (ตัวเลข ตัวอักษร และสัญลักษณ์ทั่วไป) ครอบคลุม
 * รหัสทรัพย์สิน (asset.code) และ Serial Number ได้ทั้งหมด
 */

// ตารางลายเส้นมาตรฐาน Code128 — ดัชนี 0..106 (แต่ละชุดคือความกว้างแท่ง/ช่องว่างสลับกัน เริ่มด้วยแท่ง)
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

/** คืนลำดับความกว้างโมดูล (สลับ แท่ง/ช่องว่าง เริ่มด้วยแท่ง) ของค่าที่เข้ารหัส */
function encode128B(value: string): number[] {
  const codes: number[] = [START_B];
  for (const ch of value) {
    const v = ch.charCodeAt(0) - 32;
    if (v < 0 || v > 94) continue; // ข้ามอักขระที่เข้ารหัสไม่ได้
    codes.push(v);
  }
  let sum = START_B;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103); // checksum
  codes.push(STOP);

  const mods: number[] = [];
  for (const code of codes) for (const d of PATTERNS[code]) mods.push(Number(d));
  return mods;
}

export function Barcode128({
  value,
  height = 46,
  color = '#0f172a',
  className,
  style,
}: {
  value: string;
  height?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!value) return null;
  const mods = encode128B(value);
  const total = mods.reduce((a, b) => a + b, 0);

  const bars: React.ReactElement[] = [];
  let x = 0;
  for (let i = 0; i < mods.length; i++) {
    const w = mods[i];
    if (i % 2 === 0 && w > 0) bars.push(<rect key={i} x={x} y={0} width={w} height={height} fill={color} />);
    x += w;
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
      style={style}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      {bars}
    </svg>
  );
}
