import argparse
import json
import logging
import os
import time

import redis
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("scheduler")

QUEUE_NAME = "careerscout:jobs"


def build_daily_pipeline_tasks() -> list[dict[str, object]]:
    return [
        {"type": "scrape.run"},
        {"type": "match.recompute"},
        {"type": "email.daily_digest"},
    ]


def enqueue_daily_pipeline(redis_client: redis.Redis | None = None) -> int:
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    client = redis_client or redis.from_url(redis_url, decode_responses=True, socket_timeout=3)
    tasks = build_daily_pipeline_tasks()
    pushed = 0
    try:
        for task in tasks:
            client.rpush(QUEUE_NAME, json.dumps(task))
            pushed += 1
        logger.info("enqueued %s daily pipeline tasks to %s", pushed, QUEUE_NAME)
    except Exception as exc:
        logger.warning("failed to enqueue daily pipeline: %s", exc)
    finally:
        if redis_client is None:
            client.close()
    return pushed


def main(run_now: bool = False) -> None:
    cron = os.getenv("DAILY_DIGEST_CRON", "0 7 * * *")
    trigger = CronTrigger.from_crontab(cron, timezone="UTC")

    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(enqueue_daily_pipeline, trigger)

    if run_now:
        enqueue_daily_pipeline()
    scheduler.start()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-now", action="store_true", help="Enqueue pipeline immediately on start")
    args = parser.parse_args()
    logger.info("scheduler starting")
    time.sleep(1)
    main(run_now=args.run_now)
