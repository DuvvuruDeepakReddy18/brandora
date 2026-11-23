"""Multi-page documents become pages plus positioned text lines, so findings can be marked page by page.

PDFs are rendered with PDFium; each text line keeps its page, box, font size, weight and the text colour
declared in the file. PowerPoint decks are parsed from their XML and drawn as a layout preview (text boxes,
fills and pictures); colours and sizes come from the file. Raster creatives get contrast measured by pixel
sampling. Every measurement says how it was obtained.
"""
import ctypes, io, re, statistics, zipfile
from xml.etree import ElementTree
from PIL import Image, ImageDraw
from .engine import contrast_ratio

MAX_PAGES = 20
PAGE_WIDTH = 1000  # rendered page width in pixels


class DocumentError(ValueError):
    pass


def hexcolour(rgb):
    return '#%02x%02x%02x' % tuple(int(v) for v in rgb[:3])


def jpeg(image, quality=78):
    out = io.BytesIO()
    image.convert('RGB').save(out, format='JPEG', quality=quality, optimize=True)
    return out.getvalue()


def ring_colour(image, box, margin=3):
    """Median colour of a thin ring just outside a text box: the background the text sits on."""
    W, H = image.size
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0, y0, x1, y1 = max(0, x0 - margin), max(0, y0 - margin), min(W - 1, x1 + margin), min(H - 1, y1 + margin)
    if x1 <= x0 or y1 <= y0:
        return None
    px = image.load(); samples = []
    step = max(1, (x1 - x0) // 120)
    for x in range(x0, x1 + 1, step):
        samples += [px[x, y0], px[x, y1]]
    step = max(1, (y1 - y0) // 40)
    for y in range(y0, y1 + 1, step):
        samples += [px[x0, y], px[x1, y]]
    return hexcolour([statistics.median(c[i] for c in samples) for i in range(3)])


def measure_raster(blob, regions):
    """Pixel-sampled contrast for raster creatives: background from the box border, text from its strongest ink."""
    with Image.open(io.BytesIO(blob)) as source:
        image = source.convert('RGB')
    W, H = image.size
    out = []
    for region in regions:
        y0, x0, y1, x1 = region['box']
        box = (x0 * W / 1000, y0 * H / 1000, x1 * W / 1000, y1 * H / 1000)
        bg = ring_colour(image, box, margin=0)
        crop = image.crop(tuple(int(round(v)) for v in box))
        if not bg or crop.width < 3 or crop.height < 3:
            out.append(region); continue
        crop.thumbnail((600, 120))
        pixels = list(crop.get_flattened_data() if hasattr(crop, "get_flattened_data") else crop.getdata())
        scored = sorted(((contrast_ratio(hexcolour(p), bg), p) for p in pixels), key=lambda t: t[0])
        ink = [t for t in scored if t[0] >= 1.35]
        if len(ink) < 6:
            out.append(region); continue
        fg = hexcolour(ink[int(len(ink) * 0.9)][1])
        rows = set()
        cw = crop.width
        for i, p in enumerate(pixels):
            if contrast_ratio(hexcolour(p), bg) >= 1.35:
                rows.add(i // cw)
        px_height = len(rows) * (box[3] - box[1]) / max(1, crop.height)
        out.append({**region, 'px': round(px_height, 1), 'contrast': {'fg': fg, 'bg': bg, 'ratio': contrast_ratio(fg, bg), 'method': 'pixel sample of the image'}})
    return out


def measure_colours(blob, page=0):
    """Dominant non-neutral colours of an image: average colour, share of the image and where it appears.
    Greys, black, white and near-white are ignored, so only colours that carry brand meaning are compared."""
    from .engine import lab, delta_e
    with Image.open(io.BytesIO(blob)) as source:
        image = source.convert('RGB')
    image.thumbnail((180, 180))
    W, H = image.size
    pixels = list(image.get_flattened_data() if hasattr(image, 'get_flattened_data') else image.getdata())
    bins = {}
    for i, rgb in enumerate(pixels):
        L, a, b = lab(rgb)
        if (a * a + b * b) ** 0.5 < 12:
            continue
        key = (round(L / 12), round(a / 12), round(b / 12))
        x, y = i % W, i // W
        e = bins.setdefault(key, [0, [0, 0, 0], W, H, 0, 0])
        e[0] += 1; e[1] = [e[1][j] + rgb[j] for j in range(3)]
        e[2] = min(e[2], x); e[3] = min(e[3], y); e[4] = max(e[4], x); e[5] = max(e[5], y)
    groups = []
    for count, total, x0, y0, x1, y1 in sorted(bins.values(), key=lambda e: -e[0]):
        rgb = [t / count for t in total]
        merged = next((g for g in groups if delta_e(lab(rgb), lab(g[1])) < 8), None)
        if merged:
            n = merged[0] + count
            merged[1] = [(merged[1][j] * merged[0] + rgb[j] * count) / n for j in range(3)]
            merged[0] = n; merged[2] = min(merged[2], x0); merged[3] = min(merged[3], y0); merged[4] = max(merged[4], x1); merged[5] = max(merged[5], y1)
        else:
            groups.append([count, rgb, x0, y0, x1, y1])
    out = []
    for count, rgb, x0, y0, x1, y1 in sorted(groups, key=lambda g: -g[0]):
        share = count / max(1, W * H)
        if share < 0.005:
            continue
        out.append({'hex': hexcolour([round(v) for v in rgb]), 'share': round(share, 4), 'page': page,
                    'box': [round(y0 / H * 1000), round(x0 / W * 1000), round((y1 + 1) / H * 1000), round((x1 + 1) / W * 1000)]})
    return out[:10]


def join_lines(lines):
    """Join positioned lines into one body. A line that does not end a sentence continues into a lowercase,
    digit or currency start; otherwise a newline keeps headings and separate lines apart."""
    body = ''; placed = []
    for line in lines:
        text = ' '.join(str(line.get('text', '')).split())
        if not text:
            continue
        if body:
            continues = not re.search(r'[.!?:;]$', body) and re.match(r'[a-z0-9₹(]', text)
            body += ' ' if continues else '\n'
        start = len(body); body += text
        placed.append({**line, 'text': text, 'start': start, 'end': len(body)})
    return body, placed


# ---------------- PDF ----------------
def _font_name(textpage, index, raw):
    buf = ctypes.create_string_buffer(128); flags = ctypes.c_int(0)
    n = raw.FPDFText_GetFontInfo(textpage, index, buf, 128, ctypes.byref(flags))
    return buf.value.decode('latin-1', 'ignore') if n else ''


def _fill(textpage, index, raw):
    r, g, b, a = (ctypes.c_uint() for _ in range(4))
    if raw.FPDFText_GetFillColor(textpage, index, ctypes.byref(r), ctypes.byref(g), ctypes.byref(b), ctypes.byref(a)):
        return hexcolour((r.value, g.value, b.value))
    return '#000000'


def read_pdf(blob):
    """Render each page and return (pages, lines). Lines carry page, box (0-1000), size_pt, bold and contrast."""
    import pypdfium2 as pdfium
    import pypdfium2.raw as raw
    try:
        pdf = pdfium.PdfDocument(blob)
    except Exception as exc:
        raise DocumentError('This PDF could not be read.') from exc
    if len(pdf) > MAX_PAGES:
        raise DocumentError(f'Upload at most {MAX_PAGES} pages at a time.')
    pages, lines = [], []
    for index in range(len(pdf)):
        page = pdf[index]
        width, height = page.get_size()
        scale = PAGE_WIDTH / width
        image = page.render(scale=scale).to_pil().convert('RGB')
        pages.append({'image': jpeg(image), 'width': image.width, 'height': image.height})
        textpage = page.get_textpage(); tp = textpage.raw
        current = None

        def close():
            if current and current['chars']:
                chars = [c for c in current['chars'] if not c['space']]
                if chars:
                    left = min(c['box'][0] for c in chars); bottom = min(c['box'][1] for c in chars)
                    right = max(c['box'][2] for c in chars); top = max(c['box'][3] for c in chars)
                    text = ''.join(c['ch'] for c in current['chars'])
                    size = round(statistics.median(c['size'] for c in chars), 1)
                    bold = sum('bold' in c['font'].lower() or 'black' in c['font'].lower() for c in chars) > len(chars) / 2
                    fg = statistics.mode(c['fill'] for c in chars)
                    px_box = (left * scale, (height - top) * scale, right * scale, (height - bottom) * scale)
                    bg = ring_colour(image, px_box, margin=max(2, int(size * scale * 0.18))) or '#ffffff'
                    pad = 1.5
                    lines.append({'text': text, 'page': index, 'size_pt': size, 'bold': bold,
                                  'box': [max(0, round((height - top - pad) / height * 1000)), max(0, round((left - pad) / width * 1000)),
                                          min(1000, round((height - bottom + pad) / height * 1000)), min(1000, round((right + pad) / width * 1000))],
                                  'contrast': {'fg': fg, 'bg': bg, 'ratio': contrast_ratio(fg, bg), 'method': 'text colour from the PDF, background sampled from the rendered page'}})

        for i in range(textpage.count_chars()):
            code = raw.FPDFText_GetUnicode(tp, i)
            ch = chr(code) if code else ''
            if ch in ('\r', '\n', '') or code == 0xFFFE:
                close(); current = None; continue
            box = textpage.get_charbox(i)
            size = raw.FPDFText_GetFontSize(tp, i)
            if current and (abs(box[1] - current['base']) > max(2.0, size * 0.5) or box[0] < current['right'] - size * 2):
                close(); current = None
            if current is None:
                current = {'chars': [], 'base': box[1], 'right': box[0]}
            space = ch.isspace() or box[2] - box[0] <= 0.01
            current['chars'].append({'ch': ' ' if ch.isspace() else ch, 'box': box, 'size': size, 'space': space,
                                     'font': '' if space else _font_name(tp, i, raw), 'fill': '' if space else _fill(tp, i, raw)})
            current['right'] = max(current['right'], box[2])
        close()
    lines.sort(key=lambda line: (line['page'], line['box'][0], line['box'][1]))
    return pages, lines


def page_images(blob, limit=5):
    """Rendered page images only (for scanned PDFs that need OCR)."""
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(blob)
    if len(pdf) > limit:
        raise DocumentError(f'Scanned PDFs are read with AI OCR one page at a time; upload at most {limit} pages.')
    out = []
    for index in range(len(pdf)):
        page = pdf[index]; width, _ = page.get_size()
        image = page.render(scale=PAGE_WIDTH / width).to_pil().convert('RGB')
        out.append({'image': jpeg(image), 'width': image.width, 'height': image.height})
    return out


# ---------------- PowerPoint ----------------
NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'rel': 'http://schemas.openxmlformats.org/package/2006/relationships'}
SCHEME = {'tx1': '#000000', 'dk1': '#000000', 'bg1': '#ffffff', 'lt1': '#ffffff', 'tx2': '#1f1f1f', 'bg2': '#f2f2f2'}


def _xml(archive, name):
    info = archive.getinfo(name)
    if info.file_size > 3_000_000:
        raise DocumentError('A slide is too large to read.')
    data = archive.read(name)
    if b'<!DOCTYPE' in data or b'<!ENTITY' in data:
        raise DocumentError('Unsupported XML declarations.')
    return ElementTree.fromstring(data)


def _colour(node):
    if node is None:
        return None
    srgb = node.find('a:srgbClr', NS)
    if srgb is not None:
        return '#' + srgb.get('val', '000000').lower()
    scheme = node.find('a:schemeClr', NS)
    if scheme is not None:
        return SCHEME.get(scheme.get('val', ''), None)
    return None


def _rels(archive, part):
    folder, name = part.rsplit('/', 1)
    path = f'{folder}/_rels/{name}.rels'
    if path not in archive.namelist():
        return {}
    out = {}
    for rel in _xml(archive, path).findall('rel:Relationship', NS):
        target = rel.get('Target', '')
        if not target.startswith('/'):
            parts = folder.split('/')
            for piece in target.split('/'):
                if piece == '..':
                    parts.pop()
                elif piece != '.':
                    parts.append(piece)
            target = '/'.join(parts)
        out[rel.get('Id')] = target.lstrip('/')
    return out


def _wrap(draw, text, font, width):
    words = text.split(' '); lines = []; line = ''
    for word in words:
        trial = (line + ' ' + word).strip()
        if draw.textlength(trial.replace('₹', 'R'), font=font) <= width or not line:
            line = trial
        else:
            lines.append(line); line = word
    if line:
        lines.append(line)
    return lines


def read_pptx(blob):
    """Parse slides and draw a layout preview. Returns (pages, lines, images)."""
    from .demo import font, write
    try:
        archive = zipfile.ZipFile(io.BytesIO(blob))
        presentation = _xml(archive, 'ppt/presentation.xml')
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError('This PowerPoint file could not be read. Save it as .pptx and try again.') from exc
    size = presentation.find('p:sldSz', NS)
    cx, cy = (int(size.get('cx')), int(size.get('cy'))) if size is not None else (12192000, 6858000)
    W = 1280; H = round(W * cy / cx); px_per_emu = W / cx; px_per_pt = W / (cx / 12700)
    pres_rels = _rels(archive, 'ppt/presentation.xml')
    slide_parts = [pres_rels[s.get('{%s}id' % NS['r'])] for s in presentation.findall('p:sldIdLst/p:sldId', NS)]
    if len(slide_parts) > MAX_PAGES:
        raise DocumentError(f'Upload at most {MAX_PAGES} slides at a time.')
    pages, lines, images = [], [], []
    for index, part in enumerate(slide_parts):
        slide = _xml(archive, part); rels = _rels(archive, part)
        bg = _colour(slide.find('p:cSld/p:bg/p:bgPr/a:solidFill', NS)) or '#ffffff'
        canvas = Image.new('RGB', (W, H), bg); draw = ImageDraw.Draw(canvas)
        for shape in slide.find('p:cSld/p:spTree', NS):
            tag = shape.tag.split('}')[1]
            off = shape.find('.//a:xfrm/a:off', NS); ext = shape.find('.//a:xfrm/a:ext', NS)
            if off is None or ext is None:
                x, y, w, h = 0.06 * W, 0.08 * H, 0.88 * W, 0.2 * H
            else:
                x, y = int(off.get('x')) * px_per_emu, int(off.get('y')) * px_per_emu
                w, h = int(ext.get('cx')) * px_per_emu, int(ext.get('cy')) * px_per_emu
            norm = [max(0, round(y / H * 1000)), max(0, round(x / W * 1000)), min(1000, round((y + h) / H * 1000)), min(1000, round((x + w) / W * 1000))]
            if tag == 'pic':
                props = shape.find('p:nvPicPr/p:cNvPr', NS)
                blip = shape.find('.//a:blip', NS)
                target = rels.get(blip.get('{%s}embed' % NS['r'])) if blip is not None else None
                if target and target in archive.namelist() and archive.getinfo(target).file_size < 3_000_000:
                    try:
                        with Image.open(io.BytesIO(archive.read(target))) as picture:
                            canvas.paste(picture.convert('RGB').resize((max(1, round(w)), max(1, round(h)))), (round(x), round(y)))
                    except Exception:
                        draw.rectangle((x, y, x + w, y + h), outline='#999999', width=2)
                images.append({'page': index, 'box': norm, 'alt': (props.get('descr') or '') if props is not None else '',
                               'name': (props.get('name') or 'Picture') if props is not None else 'Picture', 'label': f'Picture on slide {index + 1}'})
                continue
            if tag != 'sp':
                continue
            fill = _colour(shape.find('p:spPr/a:solidFill', NS))
            if fill:
                draw.rectangle((x, y, x + w, y + h), fill=fill)
            under = fill or bg
            body = shape.find('p:txBody', NS)
            if body is None:
                continue
            cursor = y + 0.05 * h
            for paragraph in body.findall('a:p', NS):
                runs = paragraph.findall('a:r', NS)
                text = ''.join((r.findtext('a:t', default='', namespaces=NS)) for r in runs)
                first = runs[0].find('a:rPr', NS) if runs else None
                defaults = paragraph.find('a:pPr/a:defRPr', NS)
                pt = int((first.get('sz') if first is not None and first.get('sz') else (defaults.get('sz') if defaults is not None and defaults.get('sz') else 1800))) / 100
                bold = (first.get('b') if first is not None else None) == '1'
                colour = _colour(first.find('a:solidFill', NS)) if first is not None else None
                colour = colour or '#000000'
                size_px = max(6, round(pt * px_per_pt))
                if not text.strip():
                    cursor += size_px * 0.8; continue
                f = font(size_px)
                for line in _wrap(draw, text, f, max(20, w - 0.04 * W)):
                    lx = x + 0.012 * W
                    box = write(draw, (lx, cursor), line, size_px, colour, bold=bold)
                    lines.append({'text': line, 'page': index, 'size_pt': pt, 'bold': bold,
                                  'box': [max(0, round((box[1] - 4) / H * 1000)), max(0, round((box[0] - 4) / W * 1000)), min(1000, round((box[3] + 4) / H * 1000)), min(1000, round((box[2] + 4) / W * 1000))],
                                  'contrast': {'fg': colour, 'bg': under, 'ratio': contrast_ratio(colour, under), 'method': 'text and fill colours declared in the deck'}})
                    cursor += size_px * 1.25
                cursor += size_px * 0.35
        pages.append({'image': jpeg(canvas), 'width': W, 'height': H})
    if not pages:
        raise DocumentError('No slides were found in this file.')
    return pages, lines, images
