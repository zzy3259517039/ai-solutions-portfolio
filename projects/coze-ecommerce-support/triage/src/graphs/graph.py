from langgraph.graph import StateGraph, END
from langgraph.runtime import Runtime
from langchain_core.runnables import RunnableConfig
from coze_coding_utils.runtime_ctx.context import Context
from graphs.state import (
    GlobalState,
    GraphInput,
    GraphOutput,
    RouteInput,
)
from graphs.nodes.intent_classify_node import intent_classify_node
from graphs.nodes.product_reply_node import product_reply_node
from graphs.nodes.logistics_reply_node import logistics_reply_node
from graphs.nodes.refund_reply_node import refund_reply_node
from graphs.nodes.other_reply_node import other_reply_node


def route_intent(state: RouteInput, config: RunnableConfig, runtime: Runtime[Context]) -> str:
    """
    title: 意图路由分流
    desc: 根据识别出的客户意图，将请求分流到商品咨询、物流售后、退款投诉或其它问题对应的回复节点
    """
    return state.intent


builder = StateGraph(GlobalState, input_schema=GraphInput, output_schema=GraphOutput)

builder.add_node(
    "intent_classify",
    intent_classify_node,
    metadata={"type": "agent", "llm_cfg": "config/intent_classify_llm_cfg.json"},
)
builder.add_node(
    "product_reply",
    product_reply_node,
    metadata={"type": "agent", "llm_cfg": "config/product_reply_llm_cfg.json"},
)
builder.add_node(
    "logistics_reply",
    logistics_reply_node,
    metadata={"type": "agent", "llm_cfg": "config/logistics_reply_llm_cfg.json"},
)
builder.add_node(
    "refund_reply",
    refund_reply_node,
    metadata={"type": "agent", "llm_cfg": "config/refund_reply_llm_cfg.json"},
)
builder.add_node(
    "other_reply",
    other_reply_node,
    metadata={"type": "agent", "llm_cfg": "config/other_reply_llm_cfg.json"},
)

builder.set_entry_point("intent_classify")

builder.add_conditional_edges(
    source="intent_classify",
    path=route_intent,
    path_map={
        "商品咨询": "product_reply",
        "物流售后": "logistics_reply",
        "退款投诉": "refund_reply",
        "其他问题": "other_reply",
    },
)

builder.add_edge("product_reply", END)
builder.add_edge("logistics_reply", END)
builder.add_edge("refund_reply", END)
builder.add_edge("other_reply", END)

main_graph = builder.compile()