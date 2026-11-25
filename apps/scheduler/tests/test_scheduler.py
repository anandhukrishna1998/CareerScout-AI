import json
import sys
import unittest
from pathlib import Path

SCHEDULER_ROOT = Path(__file__).resolve().parents[1]
if str(SCHEDULER_ROOT) not in sys.path:
    sys.path.insert(0, str(SCHEDULER_ROOT))

from app.main import QUEUE_NAME, build_daily_pipeline_tasks, enqueue_daily_pipeline  # noqa: E402


class _FakeRedis:
    def __init__(self) -> None:
        self.items: list[tuple[str, str]] = []

    def rpush(self, key: str, value: str) -> None:
        self.items.append((key, value))


class SchedulerTests(unittest.TestCase):
    def test_enqueue_daily_pipeline_pushes_ordered_tasks(self) -> None:
        fake = _FakeRedis()
        pushed = enqueue_daily_pipeline(redis_client=fake)  # type: ignore[arg-type]
        self.assertEqual(pushed, 3)
        self.assertEqual(len(fake.items), 3)
        self.assertTrue(all(k == QUEUE_NAME for k, _ in fake.items))
        types = [json.loads(v)["type"] for _, v in fake.items]
        self.assertEqual(types, [t["type"] for t in build_daily_pipeline_tasks()])


if __name__ == "__main__":
    unittest.main()
