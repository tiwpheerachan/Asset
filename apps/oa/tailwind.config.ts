import type { Config } from "tailwindcss";

/**
 * สีทั้งหมดอ้างตัวแปร CSS ใน globals.css — โหมดมืดสลับค่าตัวแปรที่ชั้น :root
 * จึงไม่ต้องเขียน dark: ซ้ำทุก component (ยกเว้นโทนป้ายสถานะที่ต้องคุมความอ่านง่ายเอง)
 */
export default {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        // IBM Plex Sans Thai — ชุดเดียวกับระบบ Fixed Asset (สไตล์ SHD)
        sans: [
          '"IBM Plex Sans Thai"',
          '"IBM Plex Sans"',
          '"Noto Sans SC"',
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        doc: ['"Noto Sans Thai"', '"IBM Plex Sans Thai"', "TH Sarabun New", "Angsana New", "serif"],
      },
      colors: {
        bg: "var(--c-bg)",
        surface: {
          DEFAULT: "var(--c-surface)",
          2: "var(--c-surface-2)",
          3: "var(--c-surface-3)",
        },
        border: {
          DEFAULT: "var(--c-border)",
          strong: "var(--c-border-strong)",
        },
        text: {
          DEFAULT: "var(--c-text)",
          soft: "var(--c-text-soft)",
        },
        muted: "var(--c-muted)",
        primary: {
          DEFAULT: "var(--c-primary)",
          hover: "var(--c-primary-hover)",
          active: "var(--c-primary-active)",
          soft: "var(--c-primary-soft)",
          text: "var(--c-primary-text)",
        },
        /* สีสถานะเอกสาร — ใช้ชื่อตามความหมาย ไม่ใช่ชื่อสี
           วันหลังเปลี่ยนสีส้มเป็นสีอื่น ชื่อคลาสจะได้ไม่โกหก */
        ok: "var(--c-ok)",
        wait: "var(--c-wait)",
        no: "var(--c-no)",
        draft: "var(--c-draft)",
        info: "var(--c-info)",
        ring: "var(--c-ring)",
        /* จานสีเสริม — ใช้กับของที่ต้องแยกออกจากกันด้วยสายตา เช่นหมวดฟอร์ม
           การ์ดสรุป และไอคอนในเมนู · ชื่อเป็นชื่อสีตรง ๆ เพราะเลือกมาเพื่อ "ให้ต่างกัน"
           ไม่ได้มีความหมายประจำตัวเหมือนสีสถานะ */
        sky: { DEFAULT: "var(--c-sky)", soft: "var(--c-sky-soft)", text: "var(--c-sky-text)" },
        violet: { DEFAULT: "var(--c-violet)", soft: "var(--c-violet-soft)", text: "var(--c-violet-text)" },
        teal: { DEFAULT: "var(--c-teal)", soft: "var(--c-teal-soft)", text: "var(--c-teal-text)" },
        orange: { DEFAULT: "var(--c-orange)", soft: "var(--c-orange-soft)", text: "var(--c-orange-text)" },
        pink: { DEFAULT: "var(--c-pink)", soft: "var(--c-pink-soft)", text: "var(--c-pink-text)" },
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
      },
      boxShadow: {
        e1: "var(--sh-1)",
        e2: "var(--sh-2)",
        e3: "var(--sh-3)",
      },
    },
  },
  plugins: [],
} satisfies Config;
