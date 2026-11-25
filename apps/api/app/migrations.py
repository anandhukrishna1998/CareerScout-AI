from datetime import datetime, timezone

from sqlalchemy import Connection, inspect, text

MIGRATIONS: list[tuple[str, list[tuple[str, str, str]]]] = [
    (
        "0001_saas_user_cv_job_columns",
        [
            ("users", "full_name", "VARCHAR(255) NOT NULL DEFAULT ''"),
            ("users", "plan", "VARCHAR(32) NOT NULL DEFAULT 'free'"),
            ("users", "onboarding_completed", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("users", "created_at", "TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP"),
            ("cvs", "filename", "VARCHAR(255) NOT NULL DEFAULT 'resume.txt'"),
            ("cvs", "file_size", "INTEGER NOT NULL DEFAULT 0"),
            ("cvs", "is_primary", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("cvs", "created_at", "TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP"),
            ("cv_parsed", "experience_level", "VARCHAR(32) NOT NULL DEFAULT 'mid'"),
            ("cv_parsed", "suggested_roles", "JSON NOT NULL DEFAULT '[]'"),
            ("jobs", "country", "VARCHAR(128) NOT NULL DEFAULT 'Worldwide'"),
            ("jobs", "city", "VARCHAR(128) NOT NULL DEFAULT ''"),
            ("jobs", "remote_mode", "VARCHAR(32) NOT NULL DEFAULT 'remote'"),
            ("jobs", "contract_type", "VARCHAR(64) NOT NULL DEFAULT 'Full-time'"),
            ("jobs", "experience_level", "VARCHAR(32) NOT NULL DEFAULT 'mid'"),
            ("jobs", "salary_text", "VARCHAR(128) NOT NULL DEFAULT ''"),
            ("jobs", "skills", "JSON NOT NULL DEFAULT '[]'"),
            ("jobs", "created_at", "TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP"),
            ("job_matches", "skill_score", "INTEGER NOT NULL DEFAULT 0"),
            ("job_matches", "semantic_score", "INTEGER NOT NULL DEFAULT 0"),
            ("job_matches", "experience_score", "INTEGER NOT NULL DEFAULT 0"),
            ("job_matches", "matched_skills", "JSON NOT NULL DEFAULT '[]'"),
            ("job_matches", "action_items", "JSON NOT NULL DEFAULT '[]'"),
            ("job_matches", "updated_at", "TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP"),
        ],
    ),
]


def apply_migrations(conn: Connection) -> list[str]:
    """Idempotently evolve existing tables and record applied migration versions."""
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(128) PRIMARY KEY,
                applied_at VARCHAR(64) NOT NULL
            )
            """
        )
    )
    applied_rows = conn.execute(text("SELECT version FROM schema_migrations")).fetchall()
    applied = {str(r[0]) for r in applied_rows}

    inspector = inspect(conn)
    newly_applied: list[str] = []
    for version, column_specs in MIGRATIONS:
        if version in applied:
            continue
        existing_cols_by_table: dict[str, set[str]] = {}
        for table_name, col_name, col_def in column_specs:
            if not inspector.has_table(table_name):
                continue
            cols = existing_cols_by_table.setdefault(
                table_name,
                {c["name"] for c in inspector.get_columns(table_name)},
            )
            if col_name not in cols:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"))
                cols.add(col_name)

        conn.execute(
            text(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (:v, :ts)"
            ),
            {"v": version, "ts": datetime.now(tz=timezone.utc).isoformat()},
        )
        newly_applied.append(version)

    return newly_applied
