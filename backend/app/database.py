import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


data_dir = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
data_dir.mkdir(parents=True, exist_ok=True)
engine = create_engine(
    "sqlite:///" + (data_dir / "academic.db").resolve().as_posix(),
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine, "connect")
def configure_sqlite(connection, _):
    cursor = connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    with SessionLocal() as session:
        yield session
