from fastapi import FastAPI

app = FastAPI()

@app.post("/calculate-stability")
async def calculate_stability(data: dict):
    # Aquí irán los cálculos
    return {
        "displacement": 8000,
        "estimatedGM": 1.5,
        "estimatedTrim": 0.2
    }