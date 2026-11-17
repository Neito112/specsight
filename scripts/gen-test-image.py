# Generates a synthetic "material test report" image to exercise the app end-to-end.
from PIL import Image, ImageDraw

W, H = 900, 1200
img = Image.new("RGB", (W, H), "#f5f4ef")
d = ImageDraw.Draw(img)

d.rectangle([0, 0, W, 90], fill="#1f4d8f")
d.text((40, 30), "CONCRETE COMPRESSION TEST REPORT", fill="white")
d.text((40, 110), "Report No: CT-2026-1147        Date: 2026-11-10", fill="#111")

rows = [
    "Project: Riverside Tower - Phase 2",
    "Specimen ID: C-30-07",
    "Mix design: M30 (OPC 43)",
    "Age at test: 28 days",
    "Slump: 110 mm",
    "Cube 1: 31.2 MPa",
    "Cube 2: 29.8 MPa",
    "Cube 3: 30.6 MPa",
    "Average: 30.5 MPa",
    "Required (TCVN 10306): 30 MPa",
]
y = 170
for r in rows:
    d.text((60, y), r, fill="#111")
    y += 55

d.text((60, y + 30), "Result: PASS (marginal)", fill="#0a7d2c")
d.text((60, y + 90), "Tested by: Lab B - Verified: N.T.H", fill="#444")

img.save("test-doc.png")
print("saved test-doc.png", img.size)
