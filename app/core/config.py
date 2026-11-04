import os
from datetime import datetime, timedelta, timezone

ZONA_PERU = timezone(timedelta(hours=-5))

def ahora_peru_str() -> str:
    return datetime.now(ZONA_PERU).strftime("%Y-%m-%d %H:%M:%S")

SECRET_KEY = os.getenv("SPRIN_SECRET_KEY", "IMARPE_SGAS_SUPER_SECRET_KEY_2026_SECURITY_TOKEN")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

DATA_DIR = "/data" if os.path.exists("/data") else "."

DB_NAME = "imarpe_sgp.db"
DB_PATH = os.path.join(DATA_DIR, DB_NAME)

LEGACY_DB_NAME = "imarpe_gantt.db"
LEGACY_DB_PATH = os.path.join(DATA_DIR, LEGACY_DB_NAME)