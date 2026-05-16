# Stowage Plan Optimizer

OR-Tools CP-SAT optimizer that reads from MongoDB (reefer-planner),
generates 5 alternative stowage plans with different weight objectives,
and exports results to Excel and JSON.

## Setup

```
cd stowage-optimizer
venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```
python solver.py <voyage_id>
```

If no voyage_id is provided, lists the 20 most recent voyages with their IDs.

Reads `MONGODB_URI` from `.env.local` in the project root (one level up).

## Output

Results are written to `output/` folder:
- `plan_<voyageNumber>_<timestamp>.xlsx` — 6-sheet workbook (Summary + Plan 1–5)
- `plan_<voyageNumber>_<timestamp>.json` — cargoPositions compatible with MongoDB schema

## Running the API service

```
cd stowage-optimizer
venv\Scripts\activate
pip install -r requirements.txt   # first time only
uvicorn api:app --port 8001 --reload
```

The Next.js app communicates with the service at `http://localhost:8001` (configured via
`NEXT_PUBLIC_PYTHON_ENGINE_URL` in `.env.local`).

## API endpoints

| Method | Path        | Description                                  |
|--------|-------------|----------------------------------------------|
| GET    | `/health`   | Returns `{"status":"ok","version":"1.0.0"}`  |
| POST   | `/optimize` | Body: `{"voyageId":"<id>"}` → 5 solutions    |

The `/optimize` endpoint reads the voyage from MongoDB, runs the CP-SAT solver for all
5 configurations (up to 30 s each), and returns the solution array in the same structure
as the JSON file output above.

## UI integration

From the **Stowage Plans** list page, click **🔬 Advanced Optimize** to open the
optimizer workflow at `/stowage-plans/optimize`. Select a voyage, click **Run Optimizer**,
browse the 5 solution carousel, and save your preferred plan directly to MongoDB.
