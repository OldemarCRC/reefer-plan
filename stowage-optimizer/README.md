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
