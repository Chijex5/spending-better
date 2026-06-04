from pathlib import Path

from extract import extract_text_from_image, parse_opay_receipt


IMAGE_PATH = Path("image3.png")

text = extract_text_from_image(IMAGE_PATH)
receipt = parse_opay_receipt(text)

print("OCR text:")
print(text)
print("\nExtracted receipt:")
for key, value in receipt.items():
    print(f"{key}: {value!r}")