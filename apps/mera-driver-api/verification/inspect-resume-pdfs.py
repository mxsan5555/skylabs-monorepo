"""Independently inspect real downloaded resume PDFs with local PDFium."""
from pathlib import Path
import sys, json, struct
root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / '.pdf-tools'))
import pypdfium2 as pdfium
artifacts = root / 'artifacts'
results = []
for name in ['professional-resume-full', 'professional-resume-partial', 'professional-resume-own']:
    pdf = pdfium.PdfDocument(artifacts / (name + '.pdf'))
    assert 1 <= len(pdf) <= 2, (name, len(pdf))
    pages = []
    for index in range(len(pdf)):
        page = pdf[index]
        textpage = page.get_textpage()
        text = textpage.get_text_range()
        pages.append(text)
        # Every visible character remains inside A4, including footer and all bullets.
        for char in range(textpage.count_chars()):
            box = textpage.get_charbox(char)
            if box is None:
                continue
            left, bottom, right, top = box
            assert min(left, bottom) >= -1 and right <= page.get_width()+1 and top <= page.get_height()+1, (name, index, char, box)
        bitmap = page.render(scale=1.5, force_bitmap_format=4)
        buffer = bytes(bitmap.buffer)
        header = struct.pack('<2sIHHI', b'BM', 54+len(buffer), 0, 0, 54)
        info = struct.pack('<IiiHHIIiiII', 40, bitmap.width, -bitmap.height, 1, 32, 0, len(buffer), 3780, 3780, 0, 0)
        (artifacts / f'{name}-page-{index+1}.bmp').write_bytes(header+info+buffer)
        bitmap.close(); textpage.close(); page.close()
    text = '\n'.join(pages)
    for forbidden in ['DUMMY SAMPLE','PRIVATE_BANK','PRIVATE_ADDRESS','1990-01-01','undefined','null','KYC decision history','Registration fee']:
        assert forbidden not in text, (name, forbidden)
    if name != 'professional-resume-partial':
        headings = ['PROFESSIONAL SUMMARY','DRIVING LICENCE AND VEHICLE SKILLS','WORK EXPERIENCE','KEY SKILLS','EDUCATION','LANGUAGES AND AVAILABILITY']
        positions = [text.index(heading) for heading in headings]
        assert positions == sorted(positions)
        for employer, responsibility in [('Fixture Transit','Maintained saved vehicle inspection records.'),('Fixture Fleet','Recorded journey schedules and vehicle checks.'),('Fixture Family','Planned agreed local and outstation routes.')]:
            assert any(employer in page and responsibility in page for page in pages), (name, employer, 'entry split')
        assert 'Present' in text and 'DL1420110012345' in text and 'API verification not confirmed' in text
        assert 'Fixture College' in text and 'Route planning' in text
    else:
        assert 'Resume Partial Fixture' in text
        assert 'WORK EXPERIENCE' not in text and 'PROFESSIONAL SUMMARY' not in text
    (artifacts / f'{name}-text.txt').write_text(text,encoding='utf-8')
    results.append({'file':name+'.pdf','pages':len(pdf),'sectionOrder':True,'withinPageBounds':True,'entriesKeptTogether':True,'noPrivateOrFictionalValues':True})
    pdf.close()
(artifacts / 'professional-resume-pdf-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results))
