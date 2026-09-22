"""Accessible HTML reports and printable PNG pages, using the same row data."""
from html import escape
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def html_report(title, date_label, zone, sections):
    def table(heading, rows):
        head = ''.join(f'<th scope="col" style="padding:12px;text-align:left;background:#edf0f7;color:#515968;font-size:13px">{h}</th>' for h in ['Task', 'Status', 'Deadline'])
        body = ''
        for i, row in enumerate(rows):
            cells = ''.join(f'<td style="padding:14px 12px;border-bottom:1px solid #e4e7ee;vertical-align:top;word-break:break-word">{escape(str(value))}</td>' for value in row)
            body += f'<tr style="background:{"#ffffff" if i % 2 == 0 else "#f8f9fc"}">{cells}</tr>'
        if not rows: body = '<tr><td colspan="3" style="padding:18px;color:#64748b">Nothing to report here.</td></tr>'
        return f'<h2 style="font-size:19px;margin:28px 0 12px">{escape(heading)} <span style="color:#64748b;font-size:14px">({len(rows)})</span></h2><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e7ee;border-collapse:collapse;table-layout:fixed"><colgroup><col style="width:46%"><col style="width:25%"><col style="width:29%"></colgroup><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'
    content = ''.join(table(heading, rows) for heading, rows in sections)
    return f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eff2f7;font-family:Arial,Helvetica,sans-serif;color:#202638;font-size:15px;line-height:1.6"><table role="presentation" width="100%"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:760px;margin:auto;background:#fff;border-radius:16px"><tr><td style="padding:28px"><p style="color:#6d52b6;font-weight:bold;letter-spacing:2px;font-size:12px">STUDYSPACE / YOUR DAY</p><h1 style="font-size:28px;line-height:1.2;margin:12px 0">{escape(title)}</h1><p style="color:#64748b">{escape(date_label)} · {escape(zone)}<br>Only unfinished to-dos from today and yesterday are included.</p>{content}<p style="margin-top:28px;font-size:12px;color:#64748b">PNG copies are attached. Times use {escape(zone)}. Manage delivery in Studyspace → Email reminders.</p></td></tr></table></td></tr></table></body></html>'''


def font(size, bold=False):
    paths = [Path('/usr/share/fonts/truetype/dejavu/DejaVuSans' + ('-Bold' if bold else '') + '.ttf'), Path('C:/Windows/Fonts/' + ('segoeuib.ttf' if bold else 'segoeui.ttf'))]
    for path in paths:
        if path.exists(): return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def wrap(draw, text, face, width):
    lines = []
    for paragraph in str(text).split('\n'):
        current = ''
        for word in paragraph.split():
            candidate = (current + ' ' + word).strip()
            if draw.textlength(candidate, font=face) <= width:
                current = candidate
                continue
            if current: lines.append(current)
            current = ''
            for char in word:
                if draw.textlength(current + char, font=face) > width:
                    lines.append(current); current = char
                else: current += char
        lines.append(current)
    return lines or ['']



def report_images(title, date_label, zone, sections):
    """Paginate rather than producing an unreadably tall image. Never truncate rows."""
    normal, strong, heading = font(21), font(21, True), font(36, True)
    pages = []
    canvas = draw = None
    y = 0
    def new_page():
        nonlocal canvas, draw, y
        if canvas is not None: finish()
        canvas = Image.new('RGB', (1200, 1700), '#f3f5fa'); draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((30, 25, 1170, 1675), radius=20, fill='white')
        draw.text((65, 55), 'STUDYSPACE / YOUR DAY', font=strong, fill='#7657bd')
        draw.text((65, 100), title, font=heading, fill='#202638')
        draw.text((65, 155), f'{date_label}  |  {zone}', font=normal, fill='#596579')
        y = 220
    def finish():
        height = min(1700, max(400, y + 130))
        draw.text((65, height - 65), f'Today + yesterday · Studyspace · Page {len(pages)+1}',font=normal, fill='#596579')
        data = BytesIO(); canvas.crop((0, 0, 1200, height)).save(data, format='PNG'); pages.append(data.getvalue())
    def section_header(name):
        nonlocal y
        draw.text((65, y), name, font=strong, fill='#202638'); y += 42
        draw.rectangle((65,y,1135,y+42),fill='#edf0f7')
        for x, label in [(80,'TASK'), (595,'STATUS'), (865,'DEADLINE')]: draw.text((x,y+6),label,font=strong,fill='#515968')
        y += 42
    new_page()
    for name, rows in sections:
        if y > 1430: new_page()
        section_header(name)
        for i, row in enumerate(rows or [('Nothing to report here.','','')]):
            wrapped = [wrap(draw,value,normal,width) for value,width in zip(row,[485,240,250])]
            height = max(map(len,wrapped))*30+24
            if y + height > 1590:
                new_page(); section_header(name + ' (continued)')
            draw.rectangle((65,y,1135,y+height),fill='#ffffff' if i%2==0 else '#f8f9fc')
            for x, lines in zip([80,595,865],wrapped):
                for j,line in enumerate(lines):draw.text((x,y+10+j*30),line,font=normal,fill='#202638')
            y += height
            draw.line((65,y,1135,y),fill='#e4e7ee')
        y += 35
    finish()
    return pages
