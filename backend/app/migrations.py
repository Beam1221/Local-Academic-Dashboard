"""One-time, transactional upgrade from the initial Step 2 schema."""
from sqlalchemy.schema import CreateIndex, CreateTable
from sqlalchemy.dialects import sqlite

from .database import Base


def ensure_stable_ids(engine):
    """Rebuild legacy tables with AUTOINCREMENT without changing their records.

    SQLite may otherwise reuse a deleted ID, including one still referenced by
    a browser's offline focus queue. Future schema changes should use Alembic.
    """
    connection = engine.raw_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute("BEGIN IMMEDIATE")
        for table in Base.metadata.sorted_tables:
            row = cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table.name,)).fetchone()
            if row is None or "AUTOINCREMENT" in row[0].upper():
                continue
            actual = {item[1] for item in cursor.execute(f'PRAGMA table_info("{table.name}")')}
            expected = {column.name for column in table.columns}
            triggers = cursor.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?", (table.name,)).fetchall()
            if actual != expected or triggers:
                raise RuntimeError(f"Cannot automatically upgrade customized table {table.name}; an explicit migration is required")
            temporary = f"_upgrade_{table.name}"
            statement = str(CreateTable(table).compile(dialect=sqlite.dialect()))
            statement = statement.replace(f"CREATE TABLE {table.name}", f"CREATE TABLE {temporary}", 1)
            cursor.execute(statement)
            columns = ", ".join(f'"{column.name}"' for column in table.columns)
            cursor.execute(f'INSERT INTO "{temporary}" ({columns}) SELECT {columns} FROM "{table.name}"')
            cursor.execute(f'DROP TABLE "{table.name}"')
            cursor.execute(f'ALTER TABLE "{temporary}" RENAME TO "{table.name}"')
            for index in table.indexes:
                cursor.execute(str(CreateIndex(index).compile(dialect=sqlite.dialect())))
        if cursor.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("Migration failed foreign-key validation; no changes applied")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
        connection.close()
