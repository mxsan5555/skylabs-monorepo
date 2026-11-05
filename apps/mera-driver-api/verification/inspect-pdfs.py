"""Independent local PDFium text/layout verification; no network or application writes.
Install optional tooling only under verification/.pdf-tools; root dependencies are unchanged.
"""
from pathlib import Path
import json
import sys
import struct

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / '.pdf-tools'))
import pypdfium2 as pdfium

artifacts = root / 'artifacts'
results = []
for name in ['driver-partial', 'driver-complete', 'driver-complete-with-trips', 'booking-invoice', 'driver-list-download', 'driver-complete-browser', 'driver-resume-partial', 'driver-resume-complete']:
    pdf = pdfium.PdfDocument(artifacts / (name + '.pdf'))
    text = ''
    for index in range(len(pdf)):
        page = pdf[index]
        textpage = page.get_textpage()
        text += textpage.get_text_range() + '\n'
        bitmap = page.render(scale=1.5, force_bitmap_format=4)
        buffer = bytes(bitmap.buffer)
        header = struct.pack('<2sIHHI', b'BM', 54 + len(buffer), 0, 0, 54)
        info = struct.pack('<IiiHHIIiiII', 40, bitmap.width, -bitmap.height, 1, 32, 0, len(buffer), 3780, 3780, 0, 0)
        (artifacts / f'{name}-pdfium-{index+1}.bmp').write_bytes(header + info + buffer)
        bitmap.close(); textpage.close(); page.close()
    assert 'undefined' not in text
    if name.startswith('driver-') and not name.startswith('driver-resume-'):
        for heading in ['Personal Details', 'Education & Health Details', 'Documents Details', 'Payment Details', 'Complete document inventory', 'KYC decision history', 'Licence verification', 'Registration fee', 'Trips & earnings']:
            assert heading in text, (name, heading)
    if name.startswith('driver-resume-'):
        assert 'Resume' in text and 'Mera Driver' in text
        for private in ['000000000001', 'TEST0000001', 'Verification Bank', 'Local verification address', 'KYC decision history', 'certificate.pdf']:
            assert private not in text, (name, private)
    if name == 'driver-complete':
        for value in ['Graduate', 'Verification Bank', 'Fixture police reference', 'certificate.pdf', 'Version 1', 'Version 2', 'Initiator', 'providerCalled']:
            assert value in text, value
    (artifacts / (name + '-text.txt')).write_text(text, encoding='utf-8')
    results.append({'file':name+'.pdf','pages':len(pdf),'textSectionsVerified':True})
    pdf.close()
(artifacts / 'pdf-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results))
