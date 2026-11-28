import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

AI_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from app.main import app  # noqa: E402
from app.scoring import compute_hybrid_score, extract_skills  # noqa: E402


class AIEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_word_boundary_skill_extraction_avoids_substrings(self) -> None:
        skills = extract_skills("Built NoSQL pipelines in JavaScript and React.")
        self.assertIn("NoSQL", skills)
        self.assertIn("JavaScript", skills)
        self.assertIn("React", skills)
        self.assertNotIn("SQL", skills)
        self.assertNotIn("Java", skills)

    def test_cv_parser_ignores_calendar_years(self) -> None:
        res = self.client.post(
            "/cv/parse",
            json={"text": "Graduated 2024. 3+ years building Python FastAPI LLM systems."},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["years_experience"], 3)
        self.assertIn("Python", data["skills"])
        self.assertIn("FastAPI", data["skills"])
        self.assertIn("LLM", data["skills"])

    def test_hybrid_scoring_60_25_15_and_batch_endpoint(self) -> None:
        match = compute_hybrid_score(
            cv_skills=["Python", "FastAPI", "RAG"],
            job_text="Senior AI Engineer: Python, FastAPI, RAG, Kubernetes",
            years_experience=5,
            cv_summary="Senior Python FastAPI RAG engineer",
        )
        self.assertGreaterEqual(match.skill_score, 0)
        self.assertLessEqual(match.skill_score, 60)
        self.assertLessEqual(match.semantic_score, 25)
        self.assertLessEqual(match.experience_score, 15)
        self.assertEqual(match.missing_skills, ["Kubernetes"])
        self.assertGreater(len(match.action_items), 0)

        batch = self.client.post(
            "/ats/score-batch",
            json={
                "cv_profile": {"skills": ["Python", "FastAPI"], "years_experience": 4},
                "jobs": [
                    {"title": "Python Engineer", "description": "Python FastAPI Docker"},
                    {"title": "Go Engineer", "description": "Rust Kubernetes"},
                ],
            },
        )
        self.assertEqual(batch.status_code, 200)
        results = batch.json()["results"]
        self.assertEqual(len(results), 2)
        self.assertGreater(results[0]["score"], results[1]["score"])

    def test_cover_letter_fallback_varies_by_tone(self) -> None:
        outputs = {}
        for tone in ("concise", "enthusiastic", "executive"):
            res = self.client.post(
                "/ai/cover-letter",
                json={
                    "cv_profile": {"skills": ["Python", "LLM"], "years_experience": 4},
                    "job": {"title": "AI Engineer", "company": "Acme AI", "description": "Python LLM"},
                    "tone": tone,
                },
            )
            self.assertEqual(res.status_code, 200)
            outputs[tone] = res.json()["cover_letter"]
        self.assertEqual(len(set(outputs.values())), 3)

    def test_single_keyword_role_does_not_saturate_skill_score(self) -> None:
        noisy = compute_hybrid_score(
            cv_skills=["Python", "LLM", "RAG", "Git"],
            job_text="Technical Sales Specialist (Electrical Market) - Git",
            years_experience=3,
        )
        real_match = compute_hybrid_score(
            cv_skills=["Python", "LLM", "RAG", "Git"],
            job_text="AI Engineer building Python LLM RAG pipelines",
            years_experience=3,
        )
        self.assertLessEqual(noisy.skill_score, 25)
        self.assertGreater(real_match.score, noisy.score)


if __name__ == "__main__":
    unittest.main()
