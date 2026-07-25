from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import TOOL_NAMES


def _validate_tools(tools: list[str]) -> list[str]:
    unknown = [tool for tool in tools if tool not in TOOL_NAMES]
    if unknown:
        raise ValueError(f"unknown tools: {', '.join(unknown)}. Available: {', '.join(TOOL_NAMES)}")
    # Preserve order while removing duplicates.
    return list(dict.fromkeys(tools))


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    system_prompt: str = Field(default="", max_length=8000)
    tools: list[str] = Field(default_factory=list)
    is_active: bool = True

    _check_tools = field_validator("tools")(_validate_tools)


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    system_prompt: str | None = Field(default=None, max_length=8000)
    tools: list[str] | None = None
    is_active: bool | None = None

    @field_validator("tools")
    @classmethod
    def check_tools(cls, tools: list[str] | None) -> list[str] | None:
        return None if tools is None else _validate_tools(tools)


class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    system_prompt: str
    tools: list[str]
    is_active: bool
    is_seed: bool
    created_at: datetime
    updated_at: datetime


class ToolOut(BaseModel):
    name: str
    label: str
    description: str
