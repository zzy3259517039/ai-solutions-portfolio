from typing import Optional
from pydantic import BaseModel, Field


class GlobalState(BaseModel):
    """全局状态定义"""
    user_message: str = Field(..., description="客户发送的问题")
    intent: str = Field(default="", description="识别出的客户意图")
    need_human: bool = Field(default=False, description="是否需要人工处理")
    reply: str = Field(default="", description="回复客户的内容")


class GraphInput(BaseModel):
    """工作流的输入"""
    user_message: str = Field(..., description="客户发送的问题")


class GraphOutput(BaseModel):
    """工作流的输出"""
    intent: str = Field(..., description="识别出的客户意图")
    reply: str = Field(..., description="回复客户的内容")
    need_human: bool = Field(..., description="是否需要人工处理")


class IntentClassifyInput(BaseModel):
    """意图识别节点的输入"""
    user_message: str = Field(..., description="客户发送的问题")


class IntentClassifyOutput(BaseModel):
    """意图识别节点的输出"""
    intent: str = Field(..., description="识别出的客户意图")
    need_human: bool = Field(..., description="是否需要人工处理")


class RouteInput(BaseModel):
    """意图路由判断节点的输入"""
    intent: str = Field(..., description="识别出的客户意图")


class ProductReplyInput(BaseModel):
    """商品咨询回复节点的输入"""
    user_message: str = Field(..., description="客户发送的问题")


class ProductReplyOutput(BaseModel):
    """商品咨询回复节点的输出"""
    reply: str = Field(..., description="回复客户的内容")


class LogisticsReplyInput(BaseModel):
    """物流售后回复节点的输入"""
    user_message: str = Field(..., description="客户发送的问题")


class LogisticsReplyOutput(BaseModel):
    """物流售后回复节点的输出"""
    reply: str = Field(..., description="回复客户的内容")


class RefundReplyInput(BaseModel):
    """退款投诉回复节点的输入"""
    user_message: str = Field(..., description="客户发送的问题")


class RefundReplyOutput(BaseModel):
    """退款投诉回复节点的输出"""
    reply: str = Field(..., description="回复客户的内容")


class OtherReplyInput(BaseModel):
    """其他问题回复节点的输入"""
    user_message: str = Field(..., description="客户发送的问题")


class OtherReplyOutput(BaseModel):
    """其他问题回复节点的输出"""
    reply: str = Field(..., description="回复客户的内容")