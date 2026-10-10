import unittest

from app.scoring import assess_risk


class RiskScoringTests(unittest.TestCase):
    def test_renormalizes_available_hazards_and_returns_bounded_score(self):
        result = assess_risk(
            {"flood": 80, "rainfall": 70, "heat": 40, "drought": None},
            {
                "industry_sensitivity": 75,
                "asset_sensitivity": 60,
                "weather_dependence": 50,
                "power_dependence": 40,
                "water_dependence": 30,
                "supply_chain_dependence": None,
                "interruption_sensitivity": 55,
            },
            20,
        )
        self.assertEqual(result["hazard_exposure"], 61.0)
        self.assertGreaterEqual(result["score"], 0)
        self.assertLessEqual(result["score"], 100)
        self.assertIn("supply_chain_dependence", result["missing"])

    def test_missing_inputs_use_neutral_values_and_reduce_completeness(self):
        result = assess_risk(
            {"flood": None, "rainfall": None, "heat": None, "drought": None},
            {
                "industry_sensitivity": 70,
                "asset_sensitivity": None,
                "weather_dependence": None,
                "power_dependence": None,
                "water_dependence": None,
                "supply_chain_dependence": None,
                "interruption_sensitivity": None,
            },
        )
        self.assertEqual(result["hazard_exposure"], 50)
        self.assertIsInstance(result["score"], int)
        self.assertEqual(result["completeness"], 8)

    def test_financial_vulnerability_is_included_only_when_revenue_and_costs_exist(self):
        hazards = {"flood": 70, "rainfall": 65, "heat": 45, "drought": None}
        factors = {
            "industry_sensitivity": 70,
            "asset_sensitivity": 65,
            "weather_dependence": 40,
            "power_dependence": 50,
            "water_dependence": 45,
            "supply_chain_dependence": 60,
            "interruption_sensitivity": 55,
        }
        climate_only = assess_risk(hazards, factors, 20)
        stronger_finances = assess_risk(
            hazards,
            factors,
            20,
            {"monthly_revenue": 100_000, "monthly_operating_costs": 50_000},
        )
        weaker_finances = assess_risk(
            hazards,
            factors,
            20,
            {"monthly_revenue": 100_000, "monthly_operating_costs": 95_000},
        )
        self.assertEqual(stronger_finances["financial_risk"], 50)
        self.assertEqual(weaker_finances["financial_risk"], 95)
        self.assertIsNone(climate_only["financial_risk"])
        self.assertLess(stronger_finances["score"], weaker_finances["score"])

    def test_historical_calibration_matches_frontend_hazard_preprocessing(self):
        result = assess_risk(
            {"flood": 80, "rainfall": 70, "heat": 40, "drought": 20},
            {
                "industry_sensitivity": 75,
                "asset_sensitivity": 60,
                "weather_dependence": 50,
                "power_dependence": 40,
                "water_dependence": 30,
                "supply_chain_dependence": 55,
                "interruption_sensitivity": 50,
            },
            20,
            {"monthly_revenue": 100_000, "monthly_operating_costs": 80_000},
            {
                "historical_flood_index": 60,
                "historical_drought_index": 40,
            },
        )
        self.assertEqual(result["hazard_exposure"], 50.4)
        self.assertEqual(result["financial_risk"], 80)


if __name__ == "__main__":
    unittest.main()
