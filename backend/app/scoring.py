from math import sqrt
from typing import Any

VULNERABILITY_WEIGHTS = {
    "industry_sensitivity": 0.18,
    "asset_sensitivity": 0.18,
    "weather_dependence": 0.14,
    "power_dependence": 0.12,
    "water_dependence": 0.12,
    "supply_chain_dependence": 0.14,
    "interruption_sensitivity": 0.12,
}


def _weighted_available(values: dict[str, float | None], weights: dict[str, float]) -> float:
    present = {
        key: value
        for key, value in values.items()
        if value is not None
    }
    total_weight = sum(weights[key] for key in present)
    if total_weight == 0:
        return 50.0
    return sum(present[key] * weights[key] for key in present) / total_weight


def assess_risk(
    hazards: dict[str, float | None],
    vulnerability_factors: dict[str, float | None],
    resilience: float | None = None,
    financials: dict[str, float | None] | None = None,
    calibration: dict[str, float | None] | None = None,
) -> dict[str, Any]:
    """Calculate the shared prototype score; missing inputs use neutral values."""
    calibration = calibration or {}
    historical_flood = calibration.get("historical_flood_index")
    historical_drought = calibration.get("historical_drought_index", 0) or 0
    flood = hazards.get("flood")
    rainfall = hazards.get("rainfall")
    heat = hazards.get("heat")
    drought = hazards.get("drought")
    flood_signal = (
        min(max((flood if flood is not None else 50) * 0.65 + historical_flood * 0.35, 0), 100)
        if historical_flood is not None
        else flood if flood is not None else 50
    )
    rainfall_signal = (
        min(max((rainfall if rainfall is not None else 50) * 0.7 + historical_flood * 0.3, 0), 100)
        if historical_flood is not None
        else rainfall if rainfall is not None else 50
    )
    drought_signal = (
        min(max((drought if drought is not None else 50) * 0.75 + historical_drought * 0.25, 0), 100)
        if historical_drought != 0
        else drought if drought is not None else 50
    )
    precipitation_values = [
        value for value in (flood, rainfall)
        if value is not None
    ]
    precipitation = (
        historical_flood
        if not precipitation_values and historical_flood is not None
        else max(flood_signal, rainfall_signal) if precipitation_values else None
    )
    hazard_inputs = {
        "precipitation": precipitation,
        "heat": heat,
        "drought": drought_signal,
    }
    hazard_weights = {"precipitation": 0.45, "heat": 0.25, "drought": 0.30}
    exposure = _weighted_available(hazard_inputs, hazard_weights)
    climate_vulnerability = _weighted_available(vulnerability_factors, VULNERABILITY_WEIGHTS)
    monthly_revenue = (financials or {}).get("monthly_revenue")
    monthly_operating_costs = (financials or {}).get("monthly_operating_costs")
    financial_risk = None
    if (
        monthly_revenue is not None
        and monthly_revenue > 0
        and monthly_operating_costs is not None
    ):
        financial_risk = min(max(monthly_operating_costs / monthly_revenue * 100, 0), 100)
    vulnerability = (
        climate_vulnerability
        if financial_risk is None
        else climate_vulnerability * 0.8 + financial_risk * 0.2
    )
    supplied = sum(value is not None for value in hazards.values())
    supplied += sum(value is not None for value in vulnerability_factors.values())
    supplied += resilience is not None
    expected = len(hazards) + len(VULNERABILITY_WEIGHTS) + 1
    completeness = round(supplied / expected * 100)
    base_score = sqrt(exposure * vulnerability)
    mitigation = min(max(resilience or 0, 0), 100) * 0.20
    score = round(max(0, min(100, base_score * (1 - mitigation / 100))))

    if score <= 24:
        category = "Low"
    elif score <= 49:
        category = "Moderate"
    elif score <= 74:
        category = "High"
    else:
        category = "Critical"

    return {
        "score": score,
        "category": category,
        "hazard_exposure": round(exposure, 1),
        "vulnerability": round(vulnerability, 1),
        "climate_vulnerability": round(climate_vulnerability, 1),
        "financial_risk": round(financial_risk, 1) if financial_risk is not None else None,
        "resilience": resilience,
        "completeness": completeness,
        "hazards": hazards,
        "vulnerability_factors": vulnerability_factors,
        "missing": [
            key for key, value in {
                **hazards,
                **vulnerability_factors,
                "resilience": resilience,
            }.items() if value is None
        ],
        "methodology": (
            "Precipitation proxy 45%, heat 25%, drought 30%; available inputs are "
            "renormalized and wholly missing dimensions use a neutral value of 50. "
            "When monthly revenue and operating costs are provided, business vulnerability "
            "combines climate vulnerability (80%) with operating cost ratio (20%); "
            "otherwise it uses climate vulnerability alone. Historical flood observations "
            "calibrate precipitation; only location-matched drought records inform the "
            "drought proxy. Business risk is sqrt(hazard "
            "exposure × combined vulnerability), reduced by up to 20% of the resilience "
            "input. Prototype decision support, not a validated credit or loss-prediction model."
        ),
    }
