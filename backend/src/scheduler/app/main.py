import os
import time

from apscheduler.schedulers.blocking import BlockingScheduler


def enqueue_daily_pipeline() -> None:
    # TODO: push queue tasks for scrape -> normalize -> embeddings -> matches -> email.
    print("scheduler: enqueue daily pipeline")


def main() -> None:
    cron = os.getenv("DAILY_DIGEST_CRON", "0 7 * * *")
    minute, hour, *_ = cron.split()

    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(enqueue_daily_pipeline, "cron", minute=minute, hour=hour)

    # Run once at startup for local testing.
    enqueue_daily_pipeline()

    scheduler.start()


if __name__ == "__main__":
    # Basic guard to make logs obvious in dev.
    print("scheduler: starting")
    time.sleep(1)
    main()
