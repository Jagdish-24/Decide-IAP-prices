"""
Pricing File Parser for Play Sale Automator.
Parses CSV and JSON files exported from PlayPriceEngine (or any custom sheet)
and extracts country names with their corresponding regular retail and discounted sale prices.
"""

import os
import csv
import json
import re

def parse_pricing_file(file_path):
    """
    Parses a CSV or JSON file and returns a dict mapping country name -> {
        'retail_price': float,
        'sale_price': float,
        'currency': str,
        'code': str
    }
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return _parse_csv(file_path)
    elif ext in [".json", ".js"]:
        return _parse_json(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}. Please use .csv or .json")

def _clean_number(val):
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace(",", "").strip()
    m = re.findall(r"[-+]?\d*\.?\d+", s)
    return float(m[0]) if m else 0.0

def _parse_csv(file_path):
    results = {}
    with open(file_path, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = None
        for row in reader:
            if not row or not any(row):
                continue
            if header is None:
                header = [h.strip().lower() for h in row]
                continue

            row_dict = dict(zip(header, row))
            
            # Identify country name
            country_name = (
                row_dict.get("country name") or 
                row_dict.get("country") or 
                row_dict.get("country/region") or 
                ""
            ).strip()

            if not country_name:
                continue

            # Identify currency & code
            curr = (row_dict.get("currency") or row_dict.get("currency code") or "").strip()
            code = (row_dict.get("country code") or row_dict.get("code") or row_dict.get("iso") or "").strip()

            # Identify Retail Price (Mode 1)
            retail_str = (
                row_dict.get("end-user retail price") or 
                row_dict.get("end user retail price") or 
                row_dict.get("retail price") or 
                row_dict.get("price") or 
                row_dict.get("base price") or 
                "0"
            )

            # Identify Discounted / Sale Price (Mode 2)
            sale_str = (
                row_dict.get("discounted price") or 
                row_dict.get("sale price") or 
                row_dict.get("promo price") or 
                retail_str
            )

            # Identify Discount % / Difference
            discount_pct_str = (
                row_dict.get("discount percentage") or 
                row_dict.get("discount %") or 
                row_dict.get("discount diff %") or 
                row_dict.get("discount difference %") or 
                row_dict.get("discount rate") or 
                "0"
            )

            # Identify Base Currency Price (EUR, USD, INR, GBP, etc.)
            base_col = None
            base_curr = "EUR"
            for k in row_dict.keys():
                m = re.search(r"(?:retail\s*price|price)\s*\(([a-zA-Z]{3})\)", k)
                if m:
                    base_col = k
                    base_curr = m.group(1).upper()
                    break

            base_price_str = row_dict.get(base_col, "") if base_col else (
                row_dict.get("retail price (eur)") or 
                row_dict.get("retail price (usd)") or 
                row_dict.get("retail price (inr)") or 
                row_dict.get("price eur") or 
                "0"
            )

            clean_pct_str = str(discount_pct_str).replace("%", "").strip()
            raw_pct_m = re.findall(r"[-+]?\d*\.?\d+", clean_pct_str)
            raw_pct_val = raw_pct_m[0] if raw_pct_m else "0"

            results[country_name] = {
                "name": country_name,
                "code": code,
                "currency": curr,
                "retail_price": _clean_number(retail_str),
                "retail_price_base": _clean_number(base_price_str),
                "base_currency": base_curr,
                "sale_price": _clean_number(sale_str),
                "discount_pct": _clean_number(discount_pct_str),
                "retail_raw": str(retail_str).strip(),
                "retail_base_raw": str(base_price_str).strip(),
                "sale_raw": str(sale_str).strip(),
                "discount_pct_raw": raw_pct_val
            }

    return results

def _parse_json(file_path):
    results = {}
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # If it's a list of country objects
    if isinstance(data, list):
        for item in data:
            c_name = item.get("name") or item.get("country") or item.get("country_name") or ""
            if not c_name:
                continue
            retail = _clean_number(item.get("retailPrice") or item.get("retail_price") or item.get("price") or 0)
            sale = _clean_number(item.get("discountedPrice") or item.get("discounted_price") or item.get("sale_price") or retail)
            results[c_name] = {
                "name": c_name,
                "code": item.get("code", ""),
                "currency": item.get("currency", ""),
                "retail_price": retail,
                "sale_price": sale,
                "retail_raw": str(item.get("retailPrice", retail)),
                "sale_raw": str(item.get("discountedPrice", sale))
            }

    # If it's a dict
    elif isinstance(data, dict):
        # Case A: Google Play Console API Payload format: {"pricesPayload": {"US": {"currency": "USD", "priceMicros": "990000"}}}
        if "pricesPayload" in data:
            for code, p_info in data["pricesPayload"].items():
                micros = float(p_info.get("priceMicros", 0))
                price = micros / 1000000.0
                results[code] = {
                    "code": code,
                    "currency": p_info.get("currency", ""),
                    "retail_price": price,
                    "sale_price": price,
                    "retail_raw": str(price),
                    "sale_raw": str(price)
                }
        # Case B: Country Name -> Price simple mapping: {"Albania": 0.19, "Algeria": 30}
        else:
            for c_name, val in data.items():
                if isinstance(val, dict):
                    retail = _clean_number(val.get("retail_price") or val.get("price") or 0)
                    sale = _clean_number(val.get("sale_price") or val.get("discounted_price") or retail)
                    results[c_name] = {
                        "name": c_name,
                        "code": val.get("code", ""),
                        "currency": val.get("currency", ""),
                        "retail_price": retail,
                        "sale_price": sale,
                        "retail_raw": str(retail),
                        "sale_raw": str(sale)
                    }
                else:
                    price = _clean_number(val)
                    results[c_name] = {
                        "name": c_name,
                        "code": "",
                        "currency": "",
                        "retail_price": price,
                        "sale_price": price,
                        "retail_raw": str(price),
                        "sale_raw": str(price)
                    }

    return results
