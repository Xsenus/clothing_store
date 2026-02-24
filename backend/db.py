from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import hashlib
import secrets


BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "backend" / "app.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def create_tables() -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            verified INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        )
        """
    )
    existing_columns = {row["name"] for row in cursor.execute("PRAGMA table_info(users)").fetchall()}
    if "verified" not in existing_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS verification_codes (
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            kind TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS profiles (
            user_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            name TEXT,
            phone TEXT,
            shipping_address TEXT,
            nickname TEXT
        )
        """
    )
    existing_profile_columns = {row["name"] for row in cursor.execute("PRAGMA table_info(profiles)").fetchall()}
    if "nickname" not in existing_profile_columns:
        cursor.execute("ALTER TABLE profiles ADD COLUMN nickname TEXT")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS cart_items (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            size TEXT NOT NULL,
            quantity INTEGER NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS likes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            product_id TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            items_json TEXT NOT NULL,
            total_amount REAL NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()


def create_user(email: str, password: str) -> str:
    user_id = secrets.token_hex(12)
    salt = secrets.token_hex(8)
    password_hash = hash_password(password, salt)
    conn = get_connection()
    conn.execute(
        "INSERT INTO users (id, email, password_hash, salt, verified, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, email, password_hash, salt, 0, int(time.time())),
    )
    conn.commit()
    conn.close()
    return user_id


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "password_hash": row["password_hash"],
        "salt": row["salt"],
        "verified": bool(row["verified"]),
    }


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {"id": row["id"], "email": row["email"], "verified": bool(row["verified"])}


def validate_password(email: str, password: str) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT password_hash, salt FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    if not row:
        return False
    return hash_password(password, row["salt"]) == row["password_hash"]


def set_verified(email: str) -> None:
    conn = get_connection()
    conn.execute("UPDATE users SET verified = 1 WHERE email = ?", (email,))
    conn.commit()
    conn.close()


def set_password(email: str, new_password: str) -> None:
    salt = secrets.token_hex(8)
    password_hash = hash_password(new_password, salt)
    conn = get_connection()
    conn.execute(
        "UPDATE users SET password_hash = ?, salt = ? WHERE email = ?",
        (password_hash, salt, email),
    )
    conn.commit()
    conn.close()


def create_verification_code(email: str, code: str, kind: str, expires_at: int) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM verification_codes WHERE email = ? AND kind = ?", (email, kind))
    conn.execute(
        "INSERT INTO verification_codes (email, code, kind, expires_at) VALUES (?, ?, ?, ?)",
        (email, code, kind, expires_at),
    )
    conn.commit()
    conn.close()


def verify_code(email: str, code: str, kind: str) -> bool:
    print(f"DEBUG: verify_code check - Email: '{email}', Code: '{code}', Kind: '{kind}'")
    conn = get_connection()
    row = conn.execute(
        "SELECT code, expires_at FROM verification_codes WHERE email = ? AND kind = ?",
        (email, kind),
    ).fetchone()
    if not row:
        print(f"DEBUG: No code found for email '{email}' and kind '{kind}'")
        conn.close()
        return False
    
    db_code = row["code"]
    expires_at = row["expires_at"]
    now = int(time.time())
    
    print(f"DEBUG: DB contains - Code: '{db_code}', Expires: {expires_at}, Now: {now}")
    
    if str(db_code).strip().upper() != str(code).strip().upper():
        print(f"DEBUG: Code mismatch! DB: '{db_code}' vs Input: '{code}'")
        conn.close()
        return False
        
    if now > expires_at:
        print("DEBUG: Code expired!")
        conn.close()
        return False
        
    conn.execute("DELETE FROM verification_codes WHERE email = ? AND kind = ?", (email, kind))
    conn.commit()
    conn.close()
    print("DEBUG: Verification successful!")
    return True


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    conn = get_connection()
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, int(time.time())),
    )
    conn.commit()
    conn.close()
    return token


def delete_session(token: str) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def create_admin_session() -> str:
    token = secrets.token_urlsafe(32)
    conn = get_connection()
    conn.execute(
        "INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)",
        (token, int(time.time())),
    )
    conn.commit()
    conn.close()
    return token


def delete_admin_session(token: str) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def get_admin_session(token: str) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT token FROM admin_sessions WHERE token = ?", (token,)).fetchone()
    conn.close()
    return bool(row)


def get_session_user(token: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT user_id FROM sessions WHERE token = ?", (token,)).fetchone()
    conn.close()
    if not row:
        return None
    return get_user_by_id(row["user_id"])


def upsert_profile(user_id: str, email: str, name: Optional[str], phone: Optional[str], shipping_address: Optional[str], nickname: Optional[str]) -> Dict[str, Any]:
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO profiles (user_id, email, name, phone, shipping_address, nickname)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            name = excluded.name,
            phone = excluded.phone,
            shipping_address = excluded.shipping_address,
            nickname = excluded.nickname
        """,
        (user_id, email, name, phone, shipping_address, nickname),
    )
    conn.commit()
    conn.close()
    return get_profile(user_id) or {"userId": user_id, "email": email, "name": name, "phone": phone, "shippingAddress": shipping_address, "nickname": nickname}


def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "userId": row["user_id"],
        "email": row["email"],
        "name": row["name"],
        "phone": row["phone"],
        "shippingAddress": row["shipping_address"],
        "nickname": row["nickname"],
    }


def is_nickname_taken(user_id: str, nickname: str) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT user_id FROM profiles WHERE nickname = ? AND user_id != ?",
        (nickname, user_id),
    ).fetchone()
    conn.close()
    return bool(row)


def list_cart_items(user_id: str, products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM cart_items WHERE user_id = ?", (user_id,)).fetchall()
    conn.close()
    product_index = {p.get("_id"): p for p in products}
    result = []
    for row in rows:
        product = product_index.get(row["product_id"])
        result.append(
            {
                "cartId": row["id"],
                "productId": row["product_id"],
                "size": row["size"],
                "quantity": row["quantity"],
                "product": product,
            }
        )
    return result


def add_cart_item(user_id: str, product_id: str, size: str, quantity: int, products: List[Dict[str, Any]]) -> Dict[str, Any]:
    conn = get_connection()
    existing = conn.execute(
        "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?",
        (user_id, product_id, size),
    ).fetchone()
    if existing:
        new_quantity = existing["quantity"] + quantity
        conn.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (new_quantity, existing["id"]))
        conn.commit()
        conn.close()
        return {"cartId": existing["id"], "quantity": new_quantity}
    item_id = secrets.token_hex(10)
    conn.execute(
        "INSERT INTO cart_items (id, user_id, product_id, size, quantity) VALUES (?, ?, ?, ?, ?)",
        (item_id, user_id, product_id, size, quantity),
    )
    conn.commit()
    conn.close()
    return {"cartId": item_id, "quantity": quantity}


def update_cart_item(user_id: str, item_id: str, quantity: int, products: List[Dict[str, Any]]) -> Dict[str, Any]:
    conn = get_connection()
    conn.execute(
        "UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?",
        (quantity, item_id, user_id),
    )
    conn.commit()
    conn.close()
    return {"cartId": item_id, "quantity": quantity}


def delete_cart_item(user_id: str, item_id: str) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM cart_items WHERE id = ? AND user_id = ?", (item_id, user_id))
    conn.commit()
    conn.close()


def clear_cart(user_id: str) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM cart_items WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()


def list_likes(user_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM likes WHERE user_id = ?", (user_id,)).fetchall()
    conn.close()
    return [{"id": row["id"], "productId": row["product_id"]} for row in rows]


def toggle_like(user_id: str, product_id: str) -> Dict[str, Any]:
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM likes WHERE user_id = ? AND product_id = ?",
        (user_id, product_id),
    ).fetchone()
    if existing:
        conn.execute("DELETE FROM likes WHERE id = ?", (existing["id"],))
        conn.commit()
        conn.close()
        return {"liked": False}
    like_id = secrets.token_hex(10)
    conn.execute(
        "INSERT INTO likes (id, user_id, product_id) VALUES (?, ?, ?)",
        (like_id, user_id, product_id),
    )
    conn.commit()
    conn.close()
    return {"liked": True}


def list_orders(user_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "items": json.loads(row["items_json"]),
            "totalAmount": row["total_amount"],
            "status": row["status"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def create_order(user_id: str, items: List[Dict[str, Any]], total_amount: float, status: str) -> str:
    order_id = secrets.token_hex(10)
    conn = get_connection()
    conn.execute(
        "INSERT INTO orders (id, user_id, items_json, total_amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (order_id, user_id, json.dumps(items), total_amount, status or "processing", int(time.time())),
    )
    conn.commit()
    conn.close()
    return order_id
