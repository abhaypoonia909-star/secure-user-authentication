"""
SecureAuth — Flask backend

Wires the existing SecureAuth front end (index / login / register / dashboard)
to a real Flask + SQLite backend:

  - User registration with hashed passwords (Werkzeug)
  - User login backed by Flask's signed, server-side session cookie
  - A protected /dashboard route (redirects anonymous visitors to /login)
  - Logout that clears the session
  - A `users` table created automatically on startup
  - All SQL is parameterized (no string-built queries)

Run with:
    python app.py
"""

import os
import re
import sqlite3
from datetime import timedelta
from functools import wraps

from flask import Flask, render_template, request, redirect, url_for, session, flash, g
from werkzeug.security import generate_password_hash, check_password_hash

# ---------------------------------------------------------------------------
# App configuration
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "database.db")

app = Flask(__name__)

# NOTE: This default is fine for local development only. For any real
# deployment, set a real SECRET_KEY via an environment variable instead —
# e.g. `export SECRET_KEY="..."` — so sessions stay valid across restarts
# and the key isn't sitting in source control.
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")

# Session cookie hardening: JS can't read the cookie, and it isn't sent on
# cross-site requests. SESSION_COOKIE_SECURE is left off here because the
# dev server runs over plain HTTP — turn it on once you deploy behind HTTPS.
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# How long a "Remember me" session lasts. Sessions where the box wasn't
# checked use Flask's default (a non-permanent session cookie that expires
# when the browser closes) — see the `remember` handling in /login below.
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def get_db():
    """Return a request-scoped SQLite connection (rows behave like dicts)."""
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create the users table automatically if it doesn't already exist."""
    db = sqlite3.connect(DATABASE)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name     TEXT NOT NULL,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    db.commit()
    db.close()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def login_required(view):
    """Redirect anonymous visitors to /login, preserving a flash message."""

    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if session.get("user_id") is None:
            flash("Please log in to continue.", "error")
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped_view


def get_current_user():
    """Fetch the signed-in user's row, or None if nobody is signed in."""
    user_id = session.get("user_id")
    if user_id is None:
        return None
    return get_db().execute(
        "SELECT id, full_name, email FROM users WHERE id = ?", (user_id,)
    ).fetchone()


@app.context_processor
def inject_current_user():
    # Makes `current_user` available in every template (dashboard.html uses
    # it for the name/email/user-id slots) without passing it explicitly.
    return {"current_user": get_current_user()}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    full_name = (request.form.get("full_name") or "").strip()
    email = (request.form.get("email") or "").strip().lower()
    password = request.form.get("password") or ""
    confirm_password = request.form.get("confirm_password") or ""
    terms = request.form.get("terms")

    # Server-side validation mirrors the client-side rules in main.js —
    # the browser checks are a courtesy, this is the real control.
    if len(full_name) < 2:
        flash("Enter your full name.", "error")
        return redirect(url_for("register"))

    if not EMAIL_RE.match(email):
        flash("Enter a valid email address.", "error")
        return redirect(url_for("register"))

    if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        flash("Password must be at least 8 characters and include a letter and a number.", "error")
        return redirect(url_for("register"))

    if password != confirm_password:
        flash("Passwords do not match.", "error")
        return redirect(url_for("register"))

    if not terms:
        flash("You must agree to the Terms of Service and Privacy Policy.", "error")
        return redirect(url_for("register"))

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing is not None:
        flash("An account with that email already exists.", "error")
        return redirect(url_for("register"))

    db.execute(
        "INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)",
        (full_name, email, generate_password_hash(password)),
    )
    db.commit()

    flash("Account created. Please log in.", "ok")
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")

    email = (request.form.get("email") or "").strip().lower()
    password = request.form.get("password") or ""
    remember = request.form.get("remember")

    user = get_db().execute(
        "SELECT id, password_hash FROM users WHERE email = ?", (email,)
    ).fetchone()

    # Same message whether the email is unknown or the password is wrong —
    # this avoids letting a failed login reveal which accounts exist.
    if user is None or not check_password_hash(user["password_hash"], password):
        flash("Incorrect email or password.", "error")
        return redirect(url_for("login"))

    session.clear()
    session["user_id"] = user["id"]
    session.permanent = bool(remember)  # "Remember me" -> 30-day cookie

    return redirect(url_for("dashboard"))


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    flash("You have been logged out.", "ok")
    return redirect(url_for("login"))


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
init_db()  # runs on import too, so `flask run` / gunicorn also get the table

if __name__ == "__main__":
    app.run(debug=True)
