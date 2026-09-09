from .database import Base, engine
from . import models  # Register all tables before initialization.
from .migrations import ensure_stable_ids


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    ensure_stable_ids(engine)
    print(f"Database initialized: {engine.url.database}")
