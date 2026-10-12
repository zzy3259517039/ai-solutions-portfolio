"""Check the exported mock tool only; no model, shop, or network calls."""
import importlib.util
import json
from pathlib import Path


def main():
    source = Path(__file__).parent / "triage/src/tools/product_lookup_tool.py"
    spec = importlib.util.spec_from_file_location("portfolio_product_lookup", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    cases = [
        ("TEST001", "found", "TEST001", "100%棉"),
        ("TEST002", "found", "TEST002", "80%棉、20%聚酯纤维"),
        (" test001 ", "found", "TEST001", "100%棉"),
        ("TEST999", "not_found", "TEST999", None),
        ("", "not_found", "", None),
    ]
    results = []
    for value, status, normalized_id, fabric in cases:
        actual = module.query_product(value)
        if actual.get("status") != status or actual.get("product_id") != normalized_id:
            raise AssertionError(f"Unexpected lookup result for {value!r}: {actual!r}")
        if fabric is None:
            if "product_info" in actual or actual.get("message") != "未找到商品":
                raise AssertionError("Unknown product must not invent product details")
        elif fabric not in actual.get("product_info", ""):
            raise AssertionError("Known product did not preserve its mock fabric data")
        results.append({"input": value, "output": actual, "passed": True})
    print(json.dumps({"scope": "offline mock product lookup only", "passed": len(results),
                      "total": len(cases), "cases": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
