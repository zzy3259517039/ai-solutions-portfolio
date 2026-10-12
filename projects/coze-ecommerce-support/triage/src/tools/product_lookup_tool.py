import json
import logging
import os
from typing import Dict, Any

logger = logging.getLogger("product_lookup")

# 仅用于测试的模拟商品数据，不接入真实店铺，不用于生产部署
MOCK_PRODUCTS: Dict[str, Dict[str, str]] = {
    "TEST001": {"product_name": "测试棉质短袖", "fabric": "100%棉"},
    "TEST002": {"product_name": "测试针织开衫", "fabric": "80%棉、20%聚酯纤维"},
}

TOOL_NAME = "query_product"
_MOCK_FLAG = True  # 标识数据全部为模拟数据


def query_product(product_id: str) -> Dict[str, Any]:
    """
    按商品编号查询模拟商品资料。

    参数:
        product_id: 商品编号，例如 TEST001

    返回:
        查询结果字典：
        - 命中: {"status": "found", "product_id", "product_info"}
        - 未命中: {"status": "not_found", "product_id", "message": "未找到商品"}
    """
    pid = (product_id or "").strip().upper()
    if pid in MOCK_PRODUCTS:
        info = MOCK_PRODUCTS[pid]
        result: Dict[str, Any] = {
            "status": "found",
            "product_id": pid,
            "product_info": f"商品名称：{info['product_name']}；面料：{info['fabric']}",
        }
    else:
        result = {
            "status": "not_found",
            "product_id": pid,
            "message": "未找到商品",
        }

    # 记录工具名称、输入商品编号与查询结果，不记录任何 API Token
    logger.info(
        "tool_name=%s input_product_id=%s query_result=%s",
        TOOL_NAME,
        product_id,
        json.dumps(result, ensure_ascii=False),
    )
    return result