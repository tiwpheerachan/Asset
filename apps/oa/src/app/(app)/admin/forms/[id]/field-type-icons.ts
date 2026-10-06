import {
  IconTypeDate,
  IconTypeDropdown,
  IconTypeDateRange,
  IconTypeHeading,
  IconTypeFile,
  IconTypeImage,
  IconTypeMoney,
  IconTypeMultiselect,
  IconTypeNumber,
  IconTypeSelect,
  IconTypeTable,
  IconTypeText,
  IconTypeTextarea,
  IconTypeTotal,
  IconTypeUser,
  IconLink,
} from "@/components/icons";
import type { FieldType } from "@/lib/types";

/**
 * ไอคอนประจำชนิดคำถาม — ใช้ร่วมกันระหว่างเมนูเลือกชนิดกับบรรทัดสรุปในการ์ดที่ยุบอยู่
 * ต้องเป็นตัวเดียวกันทั้งสองที่ ไม่งั้นคนเลือกจากไอคอนหนึ่งแล้วเห็นอีกไอคอนหนึ่ง
 */
export const FIELD_TYPE_ICON: Record<FieldType, (p: { className?: string }) => React.ReactElement> = {
  HEADING: IconTypeHeading,
  DATERANGE: IconTypeDateRange,
  TEXT: IconTypeText,
  TEXTAREA: IconTypeTextarea,
  NUMBER: IconTypeNumber,
  MONEY: IconTypeMoney,
  DATE: IconTypeDate,
  SELECT: IconTypeSelect,
  DROPDOWN: IconTypeDropdown,
  MULTISELECT: IconTypeMultiselect,
  USER: IconTypeUser,
  FILE: IconTypeFile,
  IMAGE: IconTypeImage,
  TABLE: IconTypeTable,
  TOTAL: IconTypeTotal,
  REQUEST: IconLink,
};
