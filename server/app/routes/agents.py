from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.config import TOOL_CONTRACT
from app.core.deps import AuthCtx, DbSession, require_roles
from app.models import AgentDefinition
from app.schemas.agents import AgentCreate, AgentOut, AgentUpdate, ToolOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/tools", response_model=list[ToolOut])
def list_tools(_ctx: AuthCtx) -> list[ToolOut]:
    return [ToolOut(name=t["name"], label=t["label"], description=t["description"]) for t in TOOL_CONTRACT]


@router.get("", response_model=list[AgentOut])
def list_agents(ctx: AuthCtx, db: DbSession) -> list[AgentOut]:
    rows = db.scalars(
        select(AgentDefinition)
        .where(AgentDefinition.org_id == ctx.org.id)
        .order_by(AgentDefinition.created_at.asc())
    ).all()
    return [AgentOut.model_validate(row) for row in rows]


@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, ctx: AuthCtx, db: DbSession) -> AgentOut:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    clash = db.scalar(
        select(AgentDefinition.id).where(
            AgentDefinition.org_id == ctx.org.id,
            func.lower(AgentDefinition.name) == name.lower(),
        )
    )
    if clash:
        raise HTTPException(status_code=409, detail="An agent with that name already exists")
    agent = AgentDefinition(
        org_id=ctx.org.id,
        user_id=ctx.user.id,
        name=name,
        description=payload.description or "",
        system_prompt=payload.system_prompt or "",
        tools=payload.tools or [],
        is_active=True,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.patch("/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: str, payload: AgentUpdate, ctx: AuthCtx, db: DbSession) -> AgentOut:
    agent = db.get(AgentDefinition, agent_id)
    if agent is None or agent.org_id != ctx.org.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        new_name = str(data["name"]).strip()
        clash = db.scalar(
            select(AgentDefinition.id).where(
                AgentDefinition.org_id == ctx.org.id,
                func.lower(AgentDefinition.name) == new_name.lower(),
                AgentDefinition.id != agent.id,
            )
        )
        if clash:
            raise HTTPException(status_code=409, detail="An agent with that name already exists")
        data["name"] = new_name
    for key, value in data.items():
        setattr(agent, key, value)
    db.commit()
    db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: str, ctx: AuthCtx, db: DbSession) -> None:
    agent = db.get(AgentDefinition, agent_id)
    if agent is None or agent.org_id != ctx.org.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.delete(agent)
    db.commit()
