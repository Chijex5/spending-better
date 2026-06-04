import re
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from PIL import Image
import pytesseract


IMAGE_PATH = Path("image.png")


def clean_lines(text):
    return [line.strip() for line in text.splitlines() if line.strip()]


def parse_amount(text):
    match = re.search(
        r"(?m)^\s*[^\d\n]*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})\s*$",
        text,
    )
    if not match:
        return None
    return Decimal(match.group(1).replace(",", ""))


def parse_receipt_datetime(text):
    # OPay format: Jun 3rd, 2026 19:14:44
    match = re.search(
        r"\b([A-Z][a-z]{2})\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})\s+(\d{2}:\d{2}:\d{2})\b",
        text,
    )
    if match:
        month, day, year, time_value = match.groups()
        return datetime.strptime(f"{month} {day} {year} {time_value}", "%b %d %Y %H:%M:%S")

    # Zenith format: 03-06-2026 09:20:48
    match = re.search(
        r"\b(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})\b",
        text,
    )
    if match:
        day, month, year, time_value = match.groups()
        return datetime.strptime(f"{day} {month} {year} {time_value}", "%d %m %Y %H:%M:%S")

    return None


def parse_recipient(lines):
    for index, line in enumerate(lines):
        if "recipient details" not in line.lower():
            continue

        account_name = line.split("Recipient Details", 1)[-1].strip()
        if not account_name and index + 1 < len(lines):
            account_name = lines[index + 1].strip()

        bank_name = None
        account_number = None
        for next_line in lines[index + 1 : index + 4]:
            bank_match = re.search(r"([A-Za-z][A-Za-z ]+)\s*[|]\s*([\d ]{6,})", next_line)
            if bank_match:
                bank_name = bank_match.group(1).strip()
                account_number = re.sub(r"\s+", "", bank_match.group(2))
                break

        return {
            "recipient_account_name": account_name or None,
            "recipient_bank_name": bank_name,
            "recipient_account_number": account_number,
        }

    return {
        "recipient_account_name": None,
        "recipient_bank_name": None,
        "recipient_account_number": None,
    }


def parse_party_details(lines, label):
    label_pattern = re.escape(label)

    for index, line in enumerate(lines):
        if label.lower() not in line.lower():
            continue

        account_name = re.sub(label_pattern, "", line, flags=re.IGNORECASE).strip()
        if not account_name and index + 1 < len(lines):
            account_name = lines[index + 1].strip()

        bank_name = None
        account_number = None
        for next_line in lines[index + 1 : index + 4]:
            bank_match = re.search(r"([A-Za-z][A-Za-z ]+)\s*[|]\s*([0-9* ]{6,})", next_line)
            if bank_match:
                bank_name = bank_match.group(1).strip()
                account_number = re.sub(r"\s+", "", bank_match.group(2))
                break

        key_prefix = label.lower().replace(" details", "").replace(" ", "_")
        return {
            f"{key_prefix}_account_name": account_name or None,
            f"{key_prefix}_bank_name": bank_name,
            f"{key_prefix}_account_number": account_number,
        }

    key_prefix = label.lower().replace(" details", "").replace(" ", "_")
    return {
        f"{key_prefix}_account_name": None,
        f"{key_prefix}_bank_name": None,
        f"{key_prefix}_account_number": None,
    }


def parse_mobile_data_details(lines):
    details = {
        "mobile_network_operator": None,
        "recipient_mobile": None,
        "data_bundle": None,
        "transaction_type": None,
    }

    for line in lines:
        match = re.match(r"Mobile\s+Network\s+Operators?\s+(.+)", line, re.IGNORECASE)
        if match:
            details["mobile_network_operator"] = match.group(1).strip()
            continue

        match = re.match(r"Recipient\s+Mobile\s+(.+)", line, re.IGNORECASE)
        if match:
            details["recipient_mobile"] = re.sub(r"\s+", "", match.group(1))
            continue

        match = re.match(r"Data\s+Bundle\s+(.+)", line, re.IGNORECASE)
        if match:
            details["data_bundle"] = match.group(1).strip()
            continue

        match = re.match(r"Transaction\s+Type\s+(.+)", line, re.IGNORECASE)
        if match:
            details["transaction_type"] = match.group(1).strip()

    return details


def parse_transaction_type(lines):
    for line in lines:
        match = re.match(r"Transaction\s+Type\s+(.+)", line, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def parse_transaction_id(text):
    # OPay: "Transaction No. 260603..."
    match = re.search(r"Transaction\s+No\.?\s*([A-Za-z0-9 -]+)", text, re.IGNORECASE)
    if match:
        return re.sub(r"\s+", "", match.group(1))
    return None


def parse_session_id(text):
    # Only match if "Session ID" is followed by an actual value on the same line
    match = re.search(r"Session\s+ID\s+([A-Za-z0-9]+)", text, re.IGNORECASE)
    if not match:
        return None
    return match.group(1).strip()


def parse_reference_id(text):
    match = re.search(r"Reference\s+ID\s+([A-Za-z0-9 -]+)", text, re.IGNORECASE)
    if not match:
        return None
    return re.sub(r"\s+", "", match.group(1))


def detect_bank(text):
    lower = text.lower()
    if "zenith" in lower or "zenithbank" in lower:
        return "zenith"
    if "opay" in lower or "d pay" in lower:
        return "opay"
    return "unknown"


def parse_receipt_type(lines):
    joined_text = "\n".join(lines).lower()
    if "transaction type mobile data" in joined_text or "data bundle" in joined_text:
        return "mobile_data"
    if "transaction type bank deposit" in joined_text:
        return "bank_deposit"
    if "recipient details" in joined_text:
        return "transfer"
    # Zenith transfer pattern
    if "credit account" in joined_text and "debit account" in joined_text:
        return "transfer"
    return "unknown"


def parse_zenith_receipt(text, lines):
    recipient_account_name = None
    recipient_bank_name = None
    recipient_account_number = None
    sender_account_name = None
    sender_bank_name = None
    sender_account_number = None

    for line in lines:
        # "Credit Account 7066865831"
        m = re.match(r"Credit\s+Account\s+(.+)", line, re.IGNORECASE)
        if m:
            recipient_account_number = m.group(1).strip()
            continue

        # "Debit Account Chijioke Uzodinma - 4216***807"
        m = re.match(r"Debit\s+Account\s+(.+)", line, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            # Split on " - " to get name and masked account number
            parts = re.split(r"\s+-\s+", raw, maxsplit=1)
            sender_account_name = parts[0].strip() if parts else raw
            sender_account_number = parts[1].strip() if len(parts) > 1 else None
            sender_bank_name = "Zenith Bank"
            continue

        # "Beneficiary Chijioke Echezona Uzodinma"
        m = re.match(r"Beneficiary\s+(.+)", line, re.IGNORECASE)
        if m:
            recipient_account_name = m.group(1).strip()
            continue

        # "Bank COPAY" (OCR misread of OPay / the destination bank)
        m = re.match(r"Bank\s+(.+)", line, re.IGNORECASE)
        if m:
            recipient_bank_name = m.group(1).strip()
            continue

    # Narration doubles as transaction_type for Zenith
    narration = None
    for line in lines:
        m = re.match(r"Narration\s+(.+)", line, re.IGNORECASE)
        if m:
            narration = m.group(1).strip()
            break

    return {
        "receipt_type": parse_receipt_type(lines),
        "amount": parse_amount(text),
        "recipient_account_name": recipient_account_name,
        "recipient_bank_name": recipient_bank_name,
        "recipient_account_number": recipient_account_number,
        "sender_account_name": sender_account_name,
        "sender_bank_name": sender_bank_name,
        "sender_account_number": sender_account_number,
        "mobile_network_operator": None,
        "recipient_mobile": None,
        "data_bundle": None,
        "transaction_type": parse_transaction_type(lines),
        "narration": narration,
        "transaction_id": parse_reference_id(text),
        "session_id": parse_session_id(text),
        "transaction_datetime": parse_receipt_datetime(text),
    }


def parse_opay_receipt(text):
    lines = clean_lines(text)
    recipient = parse_party_details(lines, "Recipient Details")
    sender = parse_party_details(lines, "Sender Details")
    mobile_data = parse_mobile_data_details(lines)

    return {
        "receipt_type": parse_receipt_type(lines),
        "amount": parse_amount(text),
        **recipient,
        **sender,
        **mobile_data,
        "narration": None,
        "transaction_type": parse_transaction_type(lines),
        "transaction_id": parse_transaction_id(text),
        "session_id": parse_session_id(text),
        "transaction_datetime": parse_receipt_datetime(text),
    }


def parse_receipt(text):
    lines = clean_lines(text)
    bank = detect_bank(text)

    if bank == "zenith":
        return parse_zenith_receipt(text, lines)
    return parse_opay_receipt(text)


def extract_text_from_image(image_path):
    return pytesseract.image_to_string(Image.open(image_path))


if __name__ == "__main__":
    ocr_text = extract_text_from_image(IMAGE_PATH)
    receipt = parse_receipt(ocr_text)

    print("OCR text:")
    print(ocr_text)
    print("\nExtracted receipt:")
    for key, value in receipt.items():
        print(f"{key}: {value!r}")