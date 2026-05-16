# stowage-optimizer/api.py
# FastAPI microservice wrapping solver.py
# Run: uvicorn api:app --port 8001 --reload

import asyncio
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env.local from project root before importing solver (solver reads MONGODB_URI)
_env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(_env_path)

from solver import load_voyage_data, build_and_solve, format_solutions  # noqa: E402

app = FastAPI(title='Reefer Stowage Optimizer', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000', 'http://192.168.10.45:3000'],
    allow_methods=['POST', 'GET'],
    allow_headers=['*'],
)


class OptimizeRequest(BaseModel):
    voyageId: str


class HealthResponse(BaseModel):
    status: str
    version: str


@app.get('/health', response_model=HealthResponse)
def health():
    return {'status': 'ok', 'version': '1.0.0'}


@app.post('/optimize')
async def optimize(req: OptimizeRequest):
    try:
        data = load_voyage_data(req.voyageId)
        if data is None:
            raise HTTPException(status_code=404, detail='Voyage not found or vessel missing')

        if not data['bookings'] and not data['forecasts']:
            raise HTTPException(
                status_code=422,
                detail='No confirmed bookings or incorporated forecasts for this voyage',
            )

        # Run solver in thread pool — CP-SAT is CPU-bound and blocks the event loop
        loop = asyncio.get_event_loop()
        solutions = await loop.run_in_executor(None, build_and_solve, data)

        return {
            'voyageId':    req.voyageId,
            'voyageNumber': data['voyageNumber'],
            'vesselName':  data['vesselName'],
            'solutions':   solutions,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
