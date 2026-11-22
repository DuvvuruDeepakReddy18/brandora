"""Builds backend/fixtures/inkloom-partner-deck.pptx, the fictional six-slide sample deck used by Explore demo.

Run once with python-pptx installed (a development-only dependency; Brandora reads decks without it):
    python scripts/make_sample_deck.py
Every problem in the deck is deliberate and listed in JUDGES.md.
"""
import io
from pathlib import Path
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Emu, Pt
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'backend' / 'fixtures' / 'inkloom-partner-deck.pptx'


def logo_png():
    image = Image.new('RGB', (460, 120), 'white'); d = ImageDraw.Draw(image)
    d.rounded_rectangle((14, 16, 102, 104), 22, fill='#5b3df5')
    d.ellipse((40, 44, 76, 84), fill='white'); d.polygon([(58, 26), (41, 58), (75, 58)], fill='white')
    d.rounded_rectangle((122, 40, 440, 80), 12, fill='#17133a')
    out = io.BytesIO(); image.save(out, format='PNG'); out.seek(0); return out


def screenshot_png():
    image = Image.new('RGB', (640, 400), '#f4f1ff'); d = ImageDraw.Draw(image)
    d.rectangle((0, 0, 640, 44), fill='#17133a')
    for i, y in enumerate((80, 170, 260)):
        d.rounded_rectangle((32, y, 608, y + 70), 12, fill='white', outline='#d9d0ff', width=2)
        d.rounded_rectangle((52, y + 18, 220 + i * 60, y + 32), 7, fill='#7a62f7')
        d.rounded_rectangle((52, y + 44, 520, y + 54), 5, fill='#e3dcff')
    out = io.BytesIO(); image.save(out, format='PNG'); out.seek(0); return out


def text(slide, left, top, width, height, lines, fill=None):
    box = slide.shapes.add_textbox(Emu(left), Emu(top), Emu(width), Emu(height))
    if fill:
        box.fill.solid(); box.fill.fore_color.rgb = RGBColor.from_string(fill)
    frame = box.text_frame; frame.word_wrap = True
    for i, (words, size, bold, colour) in enumerate(lines):
        paragraph = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        run = paragraph.add_run(); run.text = words
        run.font.size = Pt(size); run.font.bold = bold; run.font.color.rgb = RGBColor.from_string(colour)
    return box


def background(slide, colour):
    slide.background.fill.solid(); slide.background.fill.fore_color.rgb = RGBColor.from_string(colour)


def main():
    deck = Presentation(); deck.slide_width = Emu(12192000); deck.slide_height = Emu(6858000)
    blank = deck.slide_layouts[6]; W = 12192000; inch = 914400

    s = deck.slides.add_slide(blank); background(s, 'FFFFFF')
    text(s, inch, int(2.3 * inch), W - 2 * inch, int(1.2 * inch), [('Inkloom AI partner sales deck', 40, True, '17133A')])
    text(s, inch, int(3.5 * inch), W - 2 * inch, int(0.8 * inch), [('Prepared for agency partners · November 2026', 18, False, 'A9A9B8')])

    s = deck.slides.add_slide(blank); background(s, 'FFFFFF')
    text(s, inch, int(0.8 * inch), W - 2 * inch, int(0.9 * inch), [('Why Inkloom AI', 32, True, '17133A')])
    text(s, inch, int(2.0 * inch), W - 2 * inch, int(2.4 * inch), [("The world's No. 1 creative platform.", 24, False, '3A3358'), ('Reduce your marketing production time by 80%.', 24, False, '3A3358')])

    s = deck.slides.add_slide(blank); background(s, 'FFFFFF')
    text(s, inch, int(0.8 * inch), W - 2 * inch, int(0.9 * inch), [('Pricing', 32, True, '17133A')])
    text(s, inch, int(2.0 * inch), W - 2 * inch, int(2.4 * inch), [('Starter: ₹999/month.', 24, False, '3A3358'), ('Professional: ₹1,499/month.', 24, False, '3A3358')])

    s = deck.slides.add_slide(blank); background(s, 'FFFFFF')
    text(s, inch, int(0.6 * inch), W - 2 * inch, int(0.8 * inch), [('Your campaigns, organised.', 28, True, '17133A')])
    logo = s.shapes.add_picture(logo_png(), Emu(inch), Emu(int(2.0 * inch)), Emu(int(4.6 * inch)), Emu(int(1.2 * inch)))
    logo._element.nvPicPr.cNvPr.set('descr', ''); logo._element.nvPicPr.cNvPr.set('name', 'Logo')
    shot = s.shapes.add_picture(screenshot_png(), Emu(int(6.6 * inch)), Emu(int(1.8 * inch)), Emu(int(5.2 * inch)), Emu(int(3.25 * inch)))
    shot._element.nvPicPr.cNvPr.set('descr', 'image1.png'); shot._element.nvPicPr.cNvPr.set('name', 'Screenshot')

    s = deck.slides.add_slide(blank); background(s, '17133A')
    text(s, inch, int(2.2 * inch), W - 2 * inch, int(2.4 * inch), [('Our game-changing workflow saves you time!', 30, True, 'FFFFFF'), ('Start today!!', 30, True, 'FFFFFF')])

    s = deck.slides.add_slide(blank); background(s, 'FFFFFF')
    text(s, inch, int(2.4 * inch), W - 2 * inch, int(1.0 * inch), [('Start your 14-day free trial.', 32, True, '17133A')])
    text(s, inch, int(6.5 * inch), W - 2 * inch, int(0.5 * inch), [('Fictional sample deck. Offer for partner agencies only.', 7, False, '6B6680')])

    OUT.parent.mkdir(parents=True, exist_ok=True); deck.save(OUT)
    print('Wrote', OUT.relative_to(ROOT))


if __name__ == '__main__':
    main()
