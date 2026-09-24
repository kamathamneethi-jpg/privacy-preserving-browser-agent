#!/usr/bin/env python3
"""
FastAPI Server for Local Offline Laya Confidence Scoring.
Binds strictly to 127.0.0.1:8766. Zero external network egress.
"""

import sys
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

try:
    from .config import HOST, PORT, POLICY_CLASSES, DEVICE
    from .laya_engine import LayaConfidenceEngine
except ImportError:
    from config import HOST, PORT, POLICY_CLASSES, DEVICE
    from laya_engine import LayaConfidenceEngine

from contextlib import asynccontextmanager

engine = LayaConfidenceEngine()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[LayaServer] Starting Laya Confidence Service on {HOST}:{PORT} (device: {DEVICE})...")
    engine.load()
    print("[LayaServer] Engine loaded and ready for offline inference.")
    yield

app = FastAPI(title="Laya Policy Confidence Service", version="2.0.0", lifespan=lifespan)

class ScoreRequest(BaseModel):
    state: Dict[str, Any]
    options: Optional[List[str]] = POLICY_CLASSES

class BatchScoreRequest(BaseModel):
    items: List[ScoreRequest]

@app.get("/health")
def health():
    return {
        "status": "ONLINE",
        "offline_verified": True,
        "device": engine.device,
        "mode": engine.mode,
        "temperature": engine.temperature,
        "theta_star": engine.theta_star,
        "classes": POLICY_CLASSES
    }

@app.post("/score")
def score(req: ScoreRequest):
    try:
        result = engine.score_field(req.state, req.options)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/score-batch")
def score_batch(req: BatchScoreRequest):
    try:
        raw_items = [{"state": it.state, "options": it.options} for it in req.items]
        return engine.score_batch(raw_items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def main():
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")

if __name__ == "__main__":
    main()
