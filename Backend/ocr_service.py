from flask import Flask, request, jsonify
from flask_cors import CORS
import easyocr
import re
import os
import tempfile
import fitz  # PyMuPDF
import json

app = Flask(__name__)
CORS(app)

# Initialize EasyOCR reader (downloads models on first run)
print("Loading EasyOCR models (first run may download ~100MB)...")
reader = easyocr.Reader(['en'], gpu=False)
print("EasyOCR ready!")


def extract_text_from_image(image_path):
    results = reader.readtext(image_path)
    text = ' '.join([r[1] for r in results])
    lines = [r[1] for r in results]
    return text, lines


def extract_text_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    all_text = ""
    all_lines = []
    for page in doc:
        pix = page.get_pixmap(dpi=300)
        img_data = pix.tobytes("png")
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(img_data)
            tmp_path = tmp.name
        text, lines = extract_text_from_image(tmp_path)
        all_text += text + "\n"
        all_lines.extend(lines)
        os.unlink(tmp_path)
    doc.close()
    return all_text, all_lines


# ── Document Parsers ──────────────────────────────────────────

def parse_aadhar(text, lines):
    data = {}
    # Aadhar number (12 digits)
    m = re.search(r'\b(\d{4}\s?\d{4}\s?\d{4})\b', text)
    if m:
        data['aadhar_number'] = m.group(1).replace(' ', '')

    # DOB
    m = re.search(r'(?:DOB|Date of Birth|Birth|Year of Birth)[:\s]*(\d{2}[/-]\d{2}[/-]\d{4})', text, re.I)
    if m:
        data['date_of_birth'] = m.group(1)
    else:
        m = re.search(r'\b(\d{2}/\d{2}/\d{4})\b', text)
        if m:
            data['date_of_birth'] = m.group(1)

    # Gender
    if re.search(r'\bMALE\b', text, re.I):
        data['gender'] = 'Female' if re.search(r'\bFEMALE\b', text, re.I) else 'Male'

    # Name (heuristic: first non-label text line)
    skip = ['government', 'india', 'aadhaar', 'aadhar', 'uid', 'dob', 'male', 'female', 'address', 'date', 'birth']
    for line in lines:
        if len(line) > 3 and not any(k in line.lower() for k in skip) and not re.search(r'\d{4}', line):
            data['name'] = line.strip()
            break

    # Address
    addr_started = False
    addr_lines = []
    for line in lines:
        if 'address' in line.lower() or addr_started:
            addr_started = True
            if not re.search(r'\d{4}\s?\d{4}\s?\d{4}', line):
                addr_lines.append(line)
    if addr_lines:
        data['address'] = ', '.join(addr_lines[:3])

    # Pincode
    m = re.search(r'\b(\d{6})\b', text)
    if m:
        data['pincode'] = m.group(1)

    return data


def parse_pan(text, lines):
    data = {}
    m = re.search(r'\b([A-Z]{5}\d{4}[A-Z])\b', text.upper())
    if m:
        data['pan_number'] = m.group(1)

    for i, line in enumerate(lines):
        if 'name' in line.lower() and i + 1 < len(lines):
            data['name_on_pan'] = lines[i + 1].strip()
            break

    for i, line in enumerate(lines):
        if 'father' in line.lower() and i + 1 < len(lines):
            data['father_name'] = lines[i + 1].strip()
            break

    m = re.search(r'\b(\d{2}/\d{2}/\d{4})\b', text)
    if m:
        data['date_of_birth'] = m.group(1)

    return data


def parse_passbook(text, lines):
    data = {}
    m = re.search(r'(?:A/?c|Account)\s*(?:No|Number|#)?[:\s]*(\d{9,18})', text, re.I)
    if m:
        data['account_number'] = m.group(1)

    m = re.search(r'\b([A-Z]{4}0[A-Z0-9]{6})\b', text.upper())
    if m:
        data['ifsc_code'] = m.group(1)

    bank_names = ['State Bank', 'SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'Punjab National',
                  'Bank of Baroda', 'Union Bank', 'Canara Bank', 'IndusInd', 'IDFC', 'YES Bank',
                  'Federal Bank', 'Bank of India', 'Central Bank', 'Indian Bank']
    for bank in bank_names:
        if bank.lower() in text.lower():
            data['bank_name'] = bank
            break

    m = re.search(r'(?:Branch)[:\s]*(.+)', text, re.I)
    if m:
        data['branch'] = m.group(1).strip()

    return data


def parse_salary_slip(text, lines):
    data = {}
    patterns = [
        re.compile(r'(?:Net\s*(?:Pay|Salary)|Take\s*Home)[:\s]*[₹Rs.\s]*([0-9,]+(?:\.\d{2})?)', re.I),
        re.compile(r'(?:Gross\s*(?:Pay|Salary|Earnings))[:\s]*[₹Rs.\s]*([0-9,]+(?:\.\d{2})?)', re.I),
        re.compile(r'(?:Total\s*(?:Earnings|Pay))[:\s]*[₹Rs.\s]*([0-9,]+(?:\.\d{2})?)', re.I),
    ]
    for p in patterns:
        m = p.search(text)
        if m:
            data['monthly_income'] = m.group(1).replace(',', '')
            break

    emp_pattern = re.compile(r'(?:Employee\s*Name|Name)[:\s]*(.+)', re.I)
    m = emp_pattern.search(text)
    if m:
        data['employee_name'] = m.group(1).strip()

    data['employment_type'] = 'Salaried'

    for line in lines[:5]:
        if len(line) > 5 and not any(k in line.lower() for k in ['salary', 'slip', 'pay', 'month', 'date']):
            if not re.search(r'\d{4}', line):
                data['employer'] = line.strip()
                break

    return data


def parse_bank_statement(text, lines):
    data = {}
    amounts = [float(m.replace(',', '')) for m in re.findall(r'[₹Rs.\s]*([0-9,]+\.\d{2})', text)]
    if amounts:
        data['avg_balance'] = str(round(sum(amounts) / len(amounts), 2))
        data['total_transactions'] = str(len(amounts))

    emi_matches = re.findall(r'(?:EMI|emi)[:\s]*[₹Rs.\s]*([0-9,]+(?:\.\d{2})?)', text, re.I)
    if emi_matches:
        data['existing_emi'] = emi_matches[0].replace(',', '')
    return data


# ── API Endpoints ─────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ocr_online'})


@app.route('/scan', methods=['POST'])
def scan_documents():
    """Accept file paths (JSON) and extract data via OCR"""
    data = request.get_json()
    file_paths = data.get('files', {})
    results = {}

    parsers = {
        'aadhar': parse_aadhar,
        'pan': parse_pan,
        'passbook': parse_passbook,
        'salary_slip': parse_salary_slip,
        'bank_statement': parse_bank_statement
    }

    for doc_type, file_path in file_paths.items():
        if not os.path.exists(file_path):
            results[doc_type] = {'error': f'File not found: {file_path}'}
            continue
        try:
            ext = os.path.splitext(file_path)[1].lower()
            if ext == '.pdf':
                text, lines = extract_text_from_pdf(file_path)
            else:
                text, lines = extract_text_from_image(file_path)

            if doc_type in parsers:
                results[doc_type] = parsers[doc_type](text, lines)
                results[doc_type]['_raw_text'] = text[:500]
        except Exception as e:
            results[doc_type] = {'error': str(e)}

    # Merge all extracted data into a unified profile
    a = results.get('aadhar', {})
    p = results.get('pan', {})
    pb = results.get('passbook', {})
    s = results.get('salary_slip', {})
    bs = results.get('bank_statement', {})

    merged = {
        'name': a.get('name', p.get('name_on_pan', s.get('employee_name', ''))),
        'aadhar_number': a.get('aadhar_number', ''),
        'pan_number': p.get('pan_number', ''),
        'date_of_birth': a.get('date_of_birth', p.get('date_of_birth', '')),
        'gender': a.get('gender', ''),
        'address': a.get('address', ''),
        'pincode': a.get('pincode', ''),
        'father_name': p.get('father_name', ''),
        'account_number': pb.get('account_number', ''),
        'ifsc_code': pb.get('ifsc_code', ''),
        'bank_name': pb.get('bank_name', ''),
        'branch': pb.get('branch', ''),
        'monthly_income': s.get('monthly_income', ''),
        'employer': s.get('employer', ''),
        'employment_type': s.get('employment_type', ''),
        'avg_balance': bs.get('avg_balance', ''),
        'existing_emi': bs.get('existing_emi', ''),
    }

    return jsonify({
        'success': True,
        'extracted_data': merged,
        'document_details': results
    })


if __name__ == '__main__':
    print("Starting OCR Service on port 5002...")
    app.run(debug=True, host='0.0.0.0', port=5002)
