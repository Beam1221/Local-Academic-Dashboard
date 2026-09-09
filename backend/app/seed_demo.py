"""Optional example coursework. Refuses to add samples to a populated database."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .models import Course, Subtask, Task, TaskStatus, TaskType, Priority


def seed():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(Course.id).limit(1)):
            raise SystemExit("No changes made: courses already exist. Demo data is only for an empty workspace.")
        architecture = Course(name="Computer Architecture", color="#A99BFF", syllabus="Weeks 1–4: digital logic and instruction sets.\nWeeks 5–8: pipelines and memory.\nAssessment: labs 30%, project 30%, final exam 40%.")
        structures = Course(name="Data Structures", color="#72C9CF", syllabus="Arrays, linked lists, trees, graphs, and complexity analysis.\nPractice: implement each structure and test its edge cases.")
        mathematics = Course(name="Discrete Mathematics", color="#E9B56F", syllabus="Logic, proofs, sets, combinatorics, and graph theory.")
        db.add_all([architecture, structures, mathematics]); db.flush()
        now = datetime.now().astimezone()

        def due(days, hour=23):
            return (now + timedelta(days=days)).replace(hour=hour, minute=59, second=0, microsecond=0).astimezone(timezone.utc)

        records = [
            Task(course_id=architecture.id, title="Pipeline simulation report", task_type=TaskType.ASSIGNMENT, due_at=due(0), priority=Priority.HIGH, status=TaskStatus.IN_PROGRESS, description="Compare a five-stage pipeline with and without forwarding. Include timing diagrams."),
            Task(course_id=structures.id, title="Implement a binary search tree", task_type=TaskType.PROJECT, due_at=due(2), priority=Priority.HIGH, status=TaskStatus.IN_PROGRESS, description="Implement insert, find, and delete. Include complexity analysis and tests."),
            Task(course_id=mathematics.id, title="Proof techniques — problem set 3", task_type=TaskType.HOMEWORK, due_at=due(0), priority=Priority.MEDIUM),
            Task(course_id=architecture.id, title="Cache and memory quiz", task_type=TaskType.QUIZ, due_at=due(4, 10), priority=Priority.MEDIUM),
            Task(course_id=mathematics.id, title="Midterm: logic and combinatorics", task_type=TaskType.EXAM, due_at=due(7, 9), priority=Priority.HIGH),
            Task(course_id=structures.id, title="Linked list practice", task_type=TaskType.HOMEWORK, due_at=due(-1), priority=Priority.LOW, status=TaskStatus.COMPLETED),
            Task(course_id=architecture.id, title="Read chapter 4: instruction sets", task_type=TaskType.HOMEWORK, due_at=due(-1), priority=Priority.LOW),
        ]
        db.add_all(records); db.flush()
        db.add_all([Subtask(task_id=records[1].id, title=title, position=index, is_completed=index == 0) for index, title in enumerate(["Sketch the node structure", "Implement insert and search", "Handle deletion edge cases", "Write tests and complexity notes"])])
        db.commit()
    print("Created 3 example courses and 7 tasks. You can edit or delete them in the app.")


if __name__ == "__main__":
    seed()
