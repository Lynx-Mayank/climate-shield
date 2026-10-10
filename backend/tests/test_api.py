import os
import tempfile
import unittest
import uuid
from pathlib import Path

from sqlalchemy import delete
from fastapi.testclient import TestClient

TEST_DATABASE = Path(tempfile.gettempdir()) / f"climateshield-test-{uuid.uuid4().hex}.db"
os.environ["CLIMATESHIELD_DATABASE_URL"] = f"sqlite:///{TEST_DATABASE.as_posix()}"

from app.main import (  # noqa: E402
    AnalystScope,
    Base,
    GovernmentScope,
    LenderAccess,
    SessionLocal,
    User,
    app,
    engine,
)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        engine.dispose()
        TEST_DATABASE.unlink(missing_ok=True)

    def setUp(self):
        with SessionLocal() as db:
            for table in reversed(Base.metadata.sorted_tables):
                db.execute(delete(table))
            db.commit()
        self.client.cookies.clear()

    def register(self, role="owner", email=None):
        email = email or f"{uuid.uuid4().hex}@example.test"
        response = self.client.post(
            "/api/auth/register",
            json={
                "full_name": "Climate User",
                "email": email,
                "password": "correct-horse-battery",
                "role": role,
                "organization_name": "Example Business",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["user"]

    def test_health_and_registration_store_no_plaintext_password(self):
        self.assertEqual(self.client.get("/api/health").json()["database"], "connected")
        user = self.register()
        self.assertNotIn("password", user)
        self.assertTrue(self.client.cookies.get("climateshield_session"))
        self.assertEqual(self.client.get("/api/auth/me").json()["user"]["id"], user["id"])

    def test_owner_profile_and_assessment_persist_and_role_is_enforced(self):
        self.register()
        profile = {
            "name": "Example Mill",
            "industry": "Textiles",
            "latitude": 21.17,
            "longitude": 72.83,
        }
        saved = self.client.put("/api/business/profile", json=profile)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.client.get("/api/business/profile").json()["profile"]["name"], "Example Mill")

        assessment = self.client.post(
            "/api/business/assessments",
            json={
                "hazards": {"flood": 70, "rainfall": 65, "heat": 45, "drought": None},
                "vulnerability_factors": {
                    "industry_sensitivity": 70,
                    "asset_sensitivity": 65,
                    "weather_dependence": 40,
                    "power_dependence": 50,
                    "water_dependence": 45,
                    "supply_chain_dependence": 60,
                    "interruption_sensitivity": 55,
                },
                "resilience": 20,
                "financials": {
                    "monthly_revenue": 100_000,
                    "monthly_operating_costs": 80_000,
                },
            },
        )
        self.assertEqual(assessment.status_code, 201, assessment.text)
        self.assertIsInstance(assessment.json()["result"]["score"], int)
        self.assertEqual(assessment.json()["result"]["financial_risk"], 80)
        self.assertNotIn("financials", assessment.json()["result"])
        self.assertEqual(len(self.client.get("/api/business/assessments").json()["items"]), 1)
        self.assertEqual(self.client.get("/api/lender/portfolio").status_code, 403)

    def test_lender_sees_only_explicitly_authorized_assessments(self):
        self.register("lender")
        response = self.client.get("/api/lender/portfolio")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["items"], [])
        self.assertEqual(self.client.get("/api/business/profile").status_code, 403)

    def test_lender_portfolio_returns_only_authorized_assessment_summaries(self):
        owner = self.register("owner")
        owner_id = owner["id"]
        self.client.put(
            "/api/business/profile",
            json={
                "name": "Authorized Mill",
                "industry": "Textiles",
                "city": "Surat",
                "state": "Gujarat",
                "latitude": 21.17,
                "longitude": 72.83,
                "assets": "Private equipment details",
            },
        )
        self.client.post(
            "/api/business/assessments",
            json={
                "hazards": {"flood": 70, "rainfall": 65, "heat": 45, "drought": None},
                "vulnerability_factors": {"industry_sensitivity": 70},
                "resilience": 20,
                "financials": {
                    "monthly_revenue": 90_000,
                    "monthly_operating_costs": 70_000,
                },
            },
        )
        self.client.cookies.clear()
        lender = self.register("lender")
        with SessionLocal() as db:
            db.add(LenderAccess(lender_user_id=lender["id"], owner_user_id=owner_id))
            db.commit()

        portfolio = self.client.get("/api/lender/portfolio")
        self.assertEqual(portfolio.status_code, 200, portfolio.text)
        self.assertEqual(len(portfolio.json()["items"]), 1)
        item = portfolio.json()["items"][0]
        self.assertEqual(item["result"]["financial_risk"], 77.8)
        self.assertNotIn("financials", item["result"])
        self.assertEqual(item["business"], {
            "name": "Authorized Mill",
            "industry": "Textiles",
            "city": "Surat",
            "state": "Gujarat",
        })
        self.assertNotIn("email", item)
        self.assertNotIn("assets", item["business"])
        self.assertNotIn("owner_user_id", item)
        filtered = self.client.get(
            "/api/lender/portfolio?industry=Textiles&category=High&hazard=flood"
        )
        self.assertEqual(filtered.status_code, 200, filtered.text)
        self.assertEqual(len(filtered.json()["items"]), 1)
        self.assertEqual(
            self.client.get("/api/lender/portfolio?industry=Retail").json()["items"],
            [],
        )
        exported = self.client.get(
            "/api/lender/export.csv?industry=Textiles&hazard=flood"
        )
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertIn("Authorized Mill", exported.text)
        self.assertNotIn("Private equipment details", exported.text)
        self.assertEqual(self.client.get("/api/analyst/export.csv").status_code, 403)

    def test_analyst_approval_scope_and_state_filter_are_enforced(self):
        analyst = self.register("analyst")
        self.assertFalse(analyst["is_approved"])
        self.client.cookies.clear()
        pending_login = self.client.post(
            "/api/auth/login",
            json={
                "email": analyst["email"],
                "password": "correct-horse-battery",
                "role": "analyst",
            },
        )
        self.assertEqual(pending_login.status_code, 403)

        owner = self.register("owner")
        profile = self.client.put(
            "/api/business/profile",
            json={
                "name": "Scoped Example Mill",
                "industry": "Textiles",
                "city": "Surat",
                "state": "Gujarat",
                "latitude": 21.17,
                "longitude": 72.83,
            },
        )
        self.assertEqual(profile.status_code, 200, profile.text)
        assessment_response = self.client.post(
            "/api/business/assessments",
            json={
                "hazards": {"flood": 70, "rainfall": 64, "heat": 48, "drought": None},
                "vulnerability_factors": {
                    "industry_sensitivity": 70,
                    "asset_sensitivity": 65,
                    "weather_dependence": 50,
                    "power_dependence": 45,
                    "water_dependence": 40,
                    "supply_chain_dependence": 55,
                    "interruption_sensitivity": 60,
                },
                "resilience": 20,
                "source_provenance": {
                    "source": "Open-Meteo",
                    "retrieved_at": "2026-10-01T00:00:00Z",
                },
            },
        )
        self.assertEqual(assessment_response.status_code, 201, assessment_response.text)

        self.client.cookies.clear()
        with SessionLocal() as db:
            user = db.query(User).filter_by(email=analyst["email"]).one()
            user.is_approved = True
            db.add(AnalystScope(analyst_user_id=user.id, state="Gujarat"))
            db.commit()

        login = self.client.post(
            "/api/auth/login",
            json={
                "email": analyst["email"],
                "password": "correct-horse-battery",
                "role": "analyst",
            },
        )
        self.assertEqual(login.status_code, 200, login.text)
        overview = self.client.get("/api/analyst/overview")
        self.assertEqual(overview.status_code, 200, overview.text)
        self.assertEqual(overview.json()["assessments_available"], 1)
        self.assertEqual(overview.json()["states_covered"], ["Gujarat"])
        self.assertEqual(len(overview.json()["recent_assessments"]), 1)
        accessible = self.client.get("/api/analyst/assessments?state=Gujarat")
        self.assertEqual(accessible.status_code, 200, accessible.text)
        self.assertEqual(len(accessible.json()["items"]), 1)
        self.assertEqual(accessible.json()["items"][0]["business"]["name"], "Scoped Example Mill")
        self.assertNotIn("email", accessible.json()["items"][0])
        self.assertNotIn("monthly_revenue", accessible.json()["items"][0])
        self.assertIn("Scoped Example Mill", self.client.get("/api/analyst/export.csv").text)
        filtered = self.client.get(
            "/api/analyst/assessments?state=Gujarat&industry=Textiles&hazard=flood"
        )
        self.assertEqual(filtered.status_code, 200, filtered.text)
        self.assertEqual(len(filtered.json()["items"]), 1)
        self.assertEqual(
            self.client.get("/api/analyst/assessments?industry=Unrelated").json()["items"],
            [],
        )
        self.assertEqual(
            self.client.get(
                "/api/analyst/assessments?since=2099-01-01"
            ).json()["items"],
            [],
        )
        self.assertIn(
            "Scoped Example Mill",
            self.client.get("/api/analyst/export.csv?state=Gujarat&hazard=flood").text,
        )
        self.assertEqual(
            self.client.get("/api/analyst/assessments?state=Karnataka").status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/analyst/export.csv?state=Karnataka").status_code,
            403,
        )
        self.assertEqual(self.client.get("/api/business/profile").status_code, 403)
        self.assertEqual(self.client.get("/api/government/overview").status_code, 403)

    def test_government_approval_small_group_suppression_and_program_workflow(self):
        official = self.register("government")
        self.assertFalse(official["is_approved"])
        self.client.cookies.clear()
        self.assertEqual(
            self.client.post(
                "/api/auth/login",
                json={
                    "email": official["email"],
                    "password": "correct-horse-battery",
                    "role": "government",
                },
            ).status_code,
            403,
        )
        with SessionLocal() as db:
            user = db.query(User).filter_by(email=official["email"]).one()
            user.is_approved = True
            db.add(GovernmentScope(government_user_id=user.id, state="Gujarat"))
            db.commit()
        login = self.client.post(
            "/api/auth/login",
            json={
                "email": official["email"],
                "password": "correct-horse-battery",
                "role": "government",
            },
        )
        self.assertEqual(login.status_code, 200, login.text)

        overview = self.client.get("/api/government/overview").json()
        self.assertTrue(overview["privacy_suppressed"])
        self.assertIsNone(overview["assessment_count"])
        self.assertEqual(self.client.get("/api/government/map").json()["cells"], [])
        self.assertEqual(
            self.client.get("/api/government/overview?state=Karnataka").status_code,
            403,
        )

        program = {
            "name": "Regional Resilience Pilot",
            "description": "Test policy planning record.",
            "scope_state": "Gujarat",
            "target_industries": ["Textiles"],
            "climate_hazard": "Heavy rainfall",
            "start_date": "2026-11-01",
            "end_date": "2027-10-31",
            "program_status": "Draft",
            "target_businesses": 80,
            "budget": None,
            "eligibility_criteria": "",
            "progress_notes": "Created by an authorized test account.",
            "participant_count": 0,
            "outcomes": {},
        }
        created = self.client.post("/api/government/programs", json=program)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertTrue(created.json()["data_label"].startswith("Entered"))
        program["program_status"] = "Planned"
        updated = self.client.patch(
            f"/api/government/programs/{created.json()['id']}",
            json=program,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["program_status"], "Planned")
        self.assertEqual(
            self.client.get(
                f"/api/government/programs/{created.json()['id']}/impact"
            ).status_code,
            200,
        )
        self.assertIn(
            "Suppressed",
            self.client.get("/api/government/reports.csv").text,
        )

    def test_government_aggregates_and_map_enforce_five_business_threshold(self):
        def create_assessed_owner(index):
            self.client.cookies.clear()
            self.register("owner")
            self.client.put(
                "/api/business/profile",
                json={
                    "name": f"Regional Mill {index}",
                    "industry": "Textiles",
                    "city": "Surat",
                    "state": "Gujarat",
                    "latitude": 21.17,
                    "longitude": 72.83,
                },
            )
            assessment = self.client.post(
                "/api/business/assessments",
                json={
                    "hazards": {
                        "flood": 76,
                        "rainfall": 72,
                        "heat": 68,
                        "drought": 64,
                    },
                    "vulnerability_factors": {
                        "industry_sensitivity": 70,
                        "asset_sensitivity": 68,
                        "weather_dependence": 65,
                        "power_dependence": 62,
                        "water_dependence": 60,
                        "supply_chain_dependence": 66,
                        "interruption_sensitivity": 64,
                    },
                    "resilience": 20,
                    "source_provenance": {
                        "source": "Test climate dataset",
                        "retrieved_at": "2026-10-01T00:00:00Z",
                    },
                },
            )
            self.assertEqual(assessment.status_code, 201, assessment.text)

        for index in range(4):
            create_assessed_owner(index)

        self.client.cookies.clear()
        official = self.register("government")
        with SessionLocal() as db:
            user = db.query(User).filter_by(email=official["email"]).one()
            user.is_approved = True
            db.add(GovernmentScope(government_user_id=user.id, state="Gujarat"))
            db.commit()
        login = self.client.post(
            "/api/auth/login",
            json={
                "email": official["email"],
                "password": "correct-horse-battery",
                "role": "government",
            },
        )
        self.assertEqual(login.status_code, 200, login.text)

        suppressed = self.client.get("/api/government/overview").json()
        self.assertTrue(suppressed["privacy_suppressed"])
        self.assertIsNone(suppressed["assessment_count"])
        self.assertEqual(self.client.get("/api/government/map").json()["cells"], [])

        create_assessed_owner(4)
        self.client.cookies.clear()
        login = self.client.post(
            "/api/auth/login",
            json={
                "email": official["email"],
                "password": "correct-horse-battery",
                "role": "government",
            },
        )
        self.assertEqual(login.status_code, 200, login.text)

        overview_response = self.client.get("/api/government/overview")
        self.assertEqual(overview_response.status_code, 200, overview_response.text)
        overview = overview_response.json()
        self.assertFalse(overview["privacy_suppressed"])
        self.assertEqual(overview["assessment_count"], 5)
        self.assertEqual(overview["state_counts"], {"Gujarat": 5})
        self.assertEqual(overview["risk_distribution"], {"High": 5})
        self.assertEqual(
            overview["industry_average_scores"]["Textiles"]["assessment_count"],
            5,
        )

        map_response = self.client.get("/api/government/map?hazard=heat")
        self.assertEqual(map_response.status_code, 200, map_response.text)
        cells = map_response.json()["cells"]
        self.assertEqual(len(cells), 1)
        self.assertEqual(cells[0]["business_count"], 5)
        self.assertEqual(cells[0]["state"], "Gujarat")
        self.assertEqual(cells[0]["latitude"], 21.25)
        self.assertEqual(cells[0]["longitude"], 72.75)
        self.assertNotIn("businesses", cells[0])
        self.assertNotIn("owner_user_id", cells[0])

    def test_unauthenticated_and_invalid_coordinates_are_rejected(self):
        self.assertEqual(self.client.get("/api/business/profile").status_code, 401)
        self.register()
        response = self.client.put(
            "/api/business/profile",
            json={
                "name": "Invalid",
                "industry": "Retail",
                "latitude": 120,
                "longitude": 72,
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_risk_endpoint_rejects_out_of_range_and_unknown_factors(self):
        self.register()
        body = {
            "hazards": {"flood": 101},
            "vulnerability_factors": {"industry_sensitivity": 60},
            "resilience": 20,
        }
        self.assertEqual(
            self.client.post("/api/business/assessments", json=body).status_code,
            422,
        )
        body["vulnerability_factors"] = {"industry_sensitivity": 60}
        body["financials"] = {"monthly_revenue": -1}
        self.assertEqual(
            self.client.post("/api/business/assessments", json=body).status_code,
            422,
        )
        body["hazards"] = {"flood": 80}
        body["vulnerability_factors"] = {"unrecognized": 20}
        self.assertEqual(
            self.client.post("/api/business/assessments", json=body).status_code,
            422,
        )


if __name__ == "__main__":
    unittest.main()
