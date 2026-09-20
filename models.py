"""
Database models for the Perplexity clone.
Uses SQLite (via Flask-SQLAlchemy) - zero setup, single file database.
"""

import json
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from sqlalchemy.orm import validates
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


def utcnow():
    """Timezone-aware UTC 'now' (datetime.utcnow is deprecated in Python 3.12+)."""
    return datetime.now(timezone.utc)


def _as_utc(dt):
    """SQLite returns naive datetimes; treat them as UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class User(db.Model, UserMixin):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    # profile details
    full_name = db.Column(db.String(120))
    photo = db.Column(db.String(255))  # avatar filename inside static/uploads/avatars

    history = db.relationship(
        "SearchHistory", backref="user", lazy=True, cascade="all, delete-orphan"
    )

    @validates("email")
    def _normalize_email(self, key, value):
        # Bob@x.com and bob@x.com should be the same account
        return value.strip().lower()

    @validates("username")
    def _normalize_username(self, key, value):
        return value.strip()

    @property
    def display_name(self):
        return self.full_name or self.username

    @property
    def initial(self):
        return (self.display_name or "?")[:1].upper()

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class SearchHistory(db.Model):
    __tablename__ = "search_history"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    # NOTE: the Python attribute can't be called `query`, because that would
    # overwrite Flask-SQLAlchemy's `Model.query` (SearchHistory.query.filter_by
    # would break). The DB column is still named "query", so no schema change.
    query_text = db.Column("query", db.String(500), nullable=False)
    answer = db.Column(db.Text)
    # Python attribute is `sources`; the DB column keeps its original name
    # "sources_json", so existing databases work without any migration.
    sources = db.Column("sources_json", db.JSON, default=list)  # list of source dicts
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    def __init__(self, **kwargs):
        # Keep old call sites working:
        #   SearchHistory(query="...", sources_json=json.dumps([...]), ...)
        if "query" in kwargs:
            kwargs["query_text"] = kwargs.pop("query")
        if "sources_json" in kwargs:
            value = kwargs.pop("sources_json")
            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except ValueError:
                    value = []
            kwargs["sources"] = value
        super().__init__(**kwargs)

    def to_dict(self):
        created = _as_utc(self.created_at)
        return {
            "id": self.id,
            "query": self.query_text,
            "answer": self.answer,
            "sources": self.sources or [],
            # ISO 8601 with timezone; format it on the frontend, e.g.
            # new Date(x).toLocaleString([], {month: "short", day: "numeric", ...})
            "created_at": created.isoformat() if created else None,
        }