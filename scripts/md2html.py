#!/usr/bin/env python3
"""สร้างคู่มือ (HTML พร้อมหน้าปก) จาก Markdown สำหรับพิมพ์เป็น PDF ผ่าน Chrome --headless --print-to-pdf

ใช้:
  python3 md2html.py <md> <out.html> <logo.png> <system_name> <doc_title> <subtitle> <accent> <accent2>
แล้ว:
  chrome --headless=new --no-pdf-header-footer --print-to-pdf=<out.pdf> file://<out.html>
"""
import sys, re, html, base64, datetime, mimetypes

def datauri(path):
    try:
        with open(path, 'rb') as f:
            data = f.read()
        mime = mimetypes.guess_type(path)[0] or 'image/png'
        return f"data:{mime};base64," + base64.b64encode(data).decode()
    except Exception:
        return ''

def inline(t):
    # escape ก่อน แล้วค่อยใส่มาร์กอัป inline
    t = html.escape(t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
    return t

def conv(md):
    out = []
    lines = md.split('\n')
    i = 0
    n = len(lines)
    def close_list(stack):
        while stack:
            out.append('</%s>' % stack.pop())
    list_stack = []
    while i < n:
        line = lines[i]
        # code block
        if line.strip().startswith('```'):
            close_list(list_stack)
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith('```'):
                buf.append(html.escape(lines[i]))
                i += 1
            i += 1
            out.append('<pre><code>%s</code></pre>' % '\n'.join(buf))
            continue
        # table
        if '|' in line and i + 1 < n and re.match(r'^\s*\|?[\s:|-]+\|[\s:|-]*$', lines[i+1]):
            close_list(list_stack)
            header = [c.strip() for c in line.strip().strip('|').split('|')]
            i += 2
            rows = []
            while i < n and '|' in lines[i] and lines[i].strip():
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            th = ''.join('<th>%s</th>' % inline(h) for h in header)
            trs = ''
            for r in rows:
                tds = ''.join('<td>%s</td>' % inline(c) for c in r)
                trs += '<tr>%s</tr>' % tds
            out.append('<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>' % (th, trs))
            continue
        # heading
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            close_list(list_stack)
            lvl = len(m.group(1))
            out.append('<h%d>%s</h%d>' % (lvl, inline(m.group(2)), lvl))
            i += 1
            continue
        # hr
        if re.match(r'^\s*---+\s*$', line):
            close_list(list_stack)
            out.append('<hr>')
            i += 1
            continue
        # blockquote
        if line.strip().startswith('>'):
            close_list(list_stack)
            buf = []
            while i < n and lines[i].strip().startswith('>'):
                buf.append(inline(re.sub(r'^\s*>\s?', '', lines[i])))
                i += 1
            out.append('<blockquote>%s</blockquote>' % '<br>'.join(buf))
            continue
        # list item (- * or 1.) with checkbox support
        lm = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', line)
        if lm:
            indent = len(lm.group(1))
            tag = 'ol' if re.match(r'\d+\.', lm.group(2)) else 'ul'
            if not list_stack:
                out.append('<%s>' % tag); list_stack.append(tag)
            content = lm.group(3)
            content = re.sub(r'^\[ \]\s*', '☐ ', content)
            content = re.sub(r'^\[[xX]\]\s*', '☑ ', content)
            out.append('<li>%s</li>' % inline(content))
            i += 1
            continue
        # blank
        if not line.strip():
            close_list(list_stack)
            i += 1
            continue
        # paragraph
        close_list(list_stack)
        out.append('<p>%s</p>' % inline(line))
        i += 1
    close_list(list_stack)
    return '\n'.join(out)

def build(md_path, out_path, logo_path, system_name, doc_title, subtitle, accent, accent2):
    with open(md_path, encoding='utf-8') as f:
        md = f.read()
    # ตัด H1 ตัวแรก (ใช้ชื่อจากหน้าปกแทน)
    md = re.sub(r'^#\s+.*\n', '', md, count=1)
    body = conv(md)
    logo = datauri(logo_path)
    today = datetime.date.today().strftime('%d/%m/%Y')
    tmpl = f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>{html.escape(doc_title)}</title>
<style>
  @page {{ size: A4; margin: 18mm 16mm 20mm 16mm; }}
  @page {{ @bottom-center {{ content: counter(page); color:#94a3b8; font-size:9pt; }} }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, "Noto Sans Thai", "Sarabun", system-ui, sans-serif;
         color:#1e293b; font-size:10.5pt; line-height:1.6; margin:0; }}
  .cover {{ height: 257mm; display:flex; flex-direction:column; page-break-after: always; position:relative; }}
  .cover .bar {{ height:10mm; background:linear-gradient(90deg,{accent},{accent2}); border-radius:0 0 4mm 4mm; }}
  .cover .mid {{ flex:1; display:flex; flex-direction:column; justify-content:center; }}
  .cover img {{ height:26mm; width:auto; margin-bottom:10mm; }}
  .cover .system {{ font-size:12pt; color:{accent}; font-weight:700; letter-spacing:.5px; }}
  .cover h1 {{ font-size:30pt; margin:4mm 0 3mm; color:#0f172a; line-height:1.15; }}
  .cover .sub {{ font-size:12.5pt; color:#475569; max-width:150mm; }}
  .cover .meta {{ margin-top:14mm; border:1px solid #e2e8f0; border-radius:3mm; padding:6mm 7mm; max-width:120mm; }}
  .cover .meta .row {{ display:flex; gap:4mm; padding:1.6mm 0; font-size:10pt; }}
  .cover .meta .k {{ width:34mm; color:#94a3b8; }}
  .cover .meta .v {{ color:#1e293b; font-weight:600; }}
  .cover .foot {{ font-size:8.5pt; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:4mm; }}
  h1,h2,h3,h4 {{ color:#0f172a; line-height:1.3; margin:7mm 0 2.5mm; page-break-after:avoid; }}
  h2 {{ font-size:16pt; border-left:4px solid {accent}; padding-left:3mm; }}
  h3 {{ font-size:13pt; color:{accent}; }}
  h4 {{ font-size:11.5pt; }}
  p {{ margin:1.6mm 0; }}
  a {{ color:{accent}; text-decoration:none; }}
  code {{ background:#f1f5f9; border-radius:2px; padding:.5mm 1.2mm; font-family:ui-monospace,Menlo,monospace; font-size:9.3pt; }}
  pre {{ background:#f8fafc; border:1px solid #e2e8f0; border-radius:2mm; padding:3mm 4mm; overflow:auto;
        font-size:9pt; line-height:1.45; page-break-inside:avoid; }}
  pre code {{ background:none; padding:0; }}
  table {{ border-collapse:collapse; width:100%; margin:3mm 0; font-size:9.5pt; page-break-inside:avoid; }}
  th,td {{ border:1px solid #e2e8f0; padding:2mm 2.6mm; text-align:left; vertical-align:top; }}
  th {{ background:#f1f5f9; color:#334155; font-weight:700; }}
  tr:nth-child(even) td {{ background:#fafbfc; }}
  blockquote {{ border-left:3px solid {accent2}; background:#f8fafc; margin:3mm 0; padding:2.5mm 4mm; color:#475569; border-radius:0 2mm 2mm 0; }}
  ul,ol {{ margin:2mm 0; padding-left:7mm; }}
  li {{ margin:1mm 0; }}
  hr {{ border:none; border-top:1px solid #e2e8f0; margin:5mm 0; }}
  img {{ max-width:100%; }}
</style></head><body>
<section class="cover">
  <div class="bar"></div>
  <div class="mid">
    {'<img src="'+logo+'">' if logo else ''}
    <div class="system">{html.escape(system_name)}</div>
    <h1>{html.escape(doc_title)}</h1>
    <div class="sub">{html.escape(subtitle)}</div>
    <div class="meta">
      <div class="row"><div class="k">วันที่จัดทำ</div><div class="v">{today}</div></div>
      <div class="row"><div class="k">เวอร์ชัน</div><div class="v">ปรับปรุงล่าสุด</div></div>
      <div class="row"><div class="k">ชั้นความลับ</div><div class="v">เอกสารภายใน (Internal Use Only)</div></div>
    </div>
  </div>
  <div class="foot">เอกสารนี้เป็นทรัพย์สินของบริษัท เอสเอชดี เทคโนโลยี จำกัด · ปรับปรุงทุกครั้งที่ระบบมีการเปลี่ยนแปลง</div>
</section>

{body}
</body></html>"""
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tmpl)
    print("wrote", out_path)

if __name__ == '__main__':
    build(*sys.argv[1:9])
