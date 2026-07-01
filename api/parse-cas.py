import io
import json

from flask import Flask, jsonify, request

import casparser
from casparser.exceptions import CASParseError, IncorrectPasswordError

try:
    from casparser.exceptions import HeaderParseError
except ImportError:
    HeaderParseError = CASParseError  # older versions merged this into CASParseError

app = Flask(__name__)


def _parse(pdf_bytes: bytes, password: str) -> dict:
    """Call casparser and return a plain Python dict."""
    raw_json: str = casparser.read_cas_pdf(
        io.BytesIO(pdf_bytes),
        password=password,
        output="json",
    )
    return json.loads(raw_json)


def _safe_float(val):
    """Convert Decimal-serialised strings or numbers to float; return None for null/empty."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _build_transactions(scheme: dict) -> list:
    txns = []
    for t in scheme.get("transactions") or []:
        raw_date = t.get("date")
        if not raw_date:
            continue
        # date may be a "YYYY-MM-DD" string or a date object stringified
        date_str = str(raw_date)[:10]
        description = str(t.get("description") or "").strip()
        txns.append(
            {
                "date": date_str,
                "description": description,
                "amount": _safe_float(t.get("amount")),
                "units": _safe_float(t.get("units")),
                "nav": _safe_float(t.get("nav")),
                "balance": _safe_float(t.get("balance")),
                "type": t.get("type"),
            }
        )
    return txns


def _build_funds(data: dict) -> list:
    funds = []
    for folio in data.get("folios") or []:
        folio_number = str(folio.get("folio") or "")
        for scheme in folio.get("schemes") or []:
            valuation = scheme.get("valuation") or {}
            raw_isin = scheme.get("isin")
            funds.append(
                {
                    "schemeName": scheme.get("scheme", ""),
                    "isin": raw_isin if raw_isin else None,
                    "folioNumber": folio_number,
                    # `close` and valuation fields are Decimal-serialised strings in
                    # casparser JSON output — float() handles both strings and numbers.
                    "units": float(scheme.get("close") or 0),
                    "investedValue": float(valuation.get("cost") or 0),
                    "currentValue": float(valuation.get("value") or 0),
                    "currentNav": float(valuation.get("nav") or 0),
                    "transactions": _build_transactions(scheme),
                }
            )
    return funds


# Vercel routes /api/parse-cas → this file; Flask receives the full path.
# The root variant is a safety-net in case the runtime strips the prefix.
@app.route("/api/parse-cas", methods=["POST"])
@app.route("/", methods=["POST"])
def parse_cas():
    if "pdf" not in request.files:
        return (
            jsonify(
                {
                    "error": (
                        'No file provided. POST multipart/form-data with a "pdf" field '
                        'and an optional "password" field.'
                    )
                }
            ),
            400,
        )

    pdf_file = request.files["pdf"]
    if not pdf_file or not pdf_file.filename:
        return jsonify({"error": "The pdf field is empty."}), 400

    password: str = request.form.get("password", "")
    pdf_bytes: bytes = pdf_file.read()
    if not pdf_bytes:
        return jsonify({"error": "Uploaded file is empty."}), 400

    try:
        data = _parse(pdf_bytes, password)
    except IncorrectPasswordError:
        return (
            jsonify(
                {
                    "error": (
                        "Incorrect password. CAS PDFs are usually protected with "
                        "your PAN number (uppercase)."
                    )
                }
            ),
            400,
        )
    except HeaderParseError:
        return (
            jsonify(
                {
                    "error": (
                        "Unsupported CAS format. Only CAMS and KFintech "
                        "CAS PDFs are currently supported."
                    )
                }
            ),
            400,
        )
    except CASParseError as exc:
        return jsonify({"error": f"Failed to parse CAS PDF: {exc}"}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Unexpected error while processing PDF: {exc}"}), 400

    return jsonify({"funds": _build_funds(data)})
