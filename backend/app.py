from __future__ import annotations

import json
import os
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from secrets import randbelow, token_urlsafe
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests

load_dotenv()
load_dotenv(".env.local", override=True)

from .db import (
    create_tables,
    get_connection,
    get_user_by_email,
    get_user_by_id,
    create_user,
    create_session,
    delete_session,
    get_session_user,
    create_admin_session,
    delete_admin_session,
    get_admin_session,
    validate_password,
    set_verified,
    create_verification_code,
    verify_code,
    set_password,
    upsert_profile,
    get_profile,
    is_nickname_taken,
    list_cart_items,
    add_cart_item,
    update_cart_item,
    delete_cart_item,
    clear_cart,
    list_likes,
    toggle_like,
    list_orders,
    create_order,
)


BASE_DIR = Path(__file__).resolve().parent.parent
PRODUCTS_PATH = BASE_DIR / "seed" / "products.jsonl"
UPLOADS_DIR = BASE_DIR / "backend" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
PRODUCTS_DB_PATH = BASE_DIR / "backend" / "products.json"


def load_products() -> List[Dict[str, Any]]:
    if PRODUCTS_DB_PATH.exists():
        with PRODUCTS_DB_PATH.open("r", encoding="utf-8") as handle:
            try:
                data = json.load(handle)
                if isinstance(data, list) and data:
                    return data
            except json.JSONDecodeError:
                pass
    if not PRODUCTS_PATH.exists():
        return []
    products: List[Dict[str, Any]] = []
    now_ms = int(datetime.utcnow().timestamp() * 1000)
    with PRODUCTS_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            product = json.loads(line)
            if not product.get("_id"):
                product["_id"] = token_urlsafe(10)
            if not product.get("_creationTime"):
                product["_creationTime"] = now_ms
            if product.get("likesCount") is None:
                product["likesCount"] = 0
            if product.get("media") is None:
                images = product.get("images") or []
                videos = product.get("videos") or []
                product["media"] = [{"type": "image", "url": url} for url in images] + [
                    {"type": "video", "url": url} for url in videos
                ]
            products.append(product)
    if products:
        with PRODUCTS_DB_PATH.open("w", encoding="utf-8") as handle:
            json.dump(products, handle, ensure_ascii=False, indent=2)
    return products


def save_products() -> None:
    with PRODUCTS_DB_PATH.open("w", encoding="utf-8") as handle:
        json.dump(PRODUCTS, handle, ensure_ascii=False, indent=2)


PRODUCTS = load_products()


class AuthPayload(BaseModel):
    email: str
    password: str


class ProfilePayload(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    shippingAddress: Optional[str] = None
    nickname: Optional[str] = None


class CartItemPayload(BaseModel):
    productId: str
    size: str
    quantity: int


class CartUpdatePayload(BaseModel):
    quantity: int


class LikeTogglePayload(BaseModel):
    productId: str


class ReviewPayload(BaseModel):
    text: str
    media: Optional[List[str]] = None


class OrderPayload(BaseModel):
    items: List[Dict[str, Any]]
    totalAmount: float
    status: Optional[str] = "processing"


class VerifyPayload(BaseModel):
    email: str
    code: str


class ResetRequestPayload(BaseModel):
    email: str


class ResetConfirmPayload(BaseModel):
    email: str
    code: str
    newPassword: str


class ProductPayload(BaseModel):
    name: str
    slug: str
    description: str
    price: float
    sizes: List[str]
    images: List[str]
    videos: Optional[List[str]] = None
    media: Optional[List[Dict[str, Any]]] = None
    category: str
    isNew: bool = False
    isPopular: bool = False
    sku: Optional[str] = None
    material: Optional[str] = None
    printType: Optional[str] = None
    fit: Optional[str] = None
    gender: Optional[str] = None
    color: Optional[str] = None
    shipping: Optional[str] = None
    reviews: Optional[List[Dict[str, Any]]] = None
    sizeStock: Optional[Dict[str, int]] = None


class ProductUpdatePayload(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    sizes: Optional[List[str]] = None
    images: Optional[List[str]] = None
    videos: Optional[List[str]] = None
    media: Optional[List[Dict[str, Any]]] = None
    category: Optional[str] = None
    isNew: Optional[bool] = None
    isPopular: Optional[bool] = None
    sku: Optional[str] = None
    material: Optional[str] = None
    printType: Optional[str] = None
    fit: Optional[str] = None
    gender: Optional[str] = None
    color: Optional[str] = None
    shipping: Optional[str] = None
    reviews: Optional[List[Dict[str, Any]]] = None
    sizeStock: Optional[Dict[str, int]] = None


app = FastAPI()
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

RESEND_TRACKING_READY = False
RESEND_TRACKING_ERROR: Optional[str] = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    create_tables()
    try:
        ensure_resend_tracking()
    except HTTPException:
        return


def get_current_user(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth_header.replace("Bearer ", "").strip()
    user = get_session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def get_admin_user(request: Request) -> None:
    token = request.headers.get("X-Admin-Token", "").strip()
    if not token or not get_admin_session(token):
        raise HTTPException(status_code=401, detail="Admin unauthorized")


def get_admin_credentials() -> Dict[str, str]:
    email = os.getenv("ADMIN_EMAIL")
    password = os.getenv("ADMIN_PASSWORD")
    if not email or not password:
        raise HTTPException(status_code=500, detail="Admin credentials not set")
    return {"email": email, "password": password}


def resend_request(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> requests.Response:
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="RESEND_API_KEY not set")
    url = f"https://api.resend.com{path}"
    last_error = None
    for attempt in range(3):
        try:
            response = requests.request(
                method,
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=10,
            )
        except requests.RequestException as exc:
            last_error = str(exc)
        else:
            if response.status_code == 429 or response.status_code >= 500:
                last_error = response.text or f"Resend error: {response.status_code}"
            elif response.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail=response.text or f"Resend error: {response.status_code}",
                )
            else:
                return response
        if attempt < 2:
            time.sleep(0.5 * (2**attempt))
    raise HTTPException(status_code=502, detail=last_error or "Resend error")


def enable_resend_tracking() -> None:
    tracking_domain = os.getenv("RESEND_TRACKING_DOMAIN") or "fashion-demon.shop"
    response = resend_request("GET", "/domains")
    data = response.json().get("data", [])
    domain = next((item for item in data if item.get("name") == tracking_domain), None)
    if not domain:
        raise HTTPException(status_code=502, detail=f"Resend domain not found: {tracking_domain}")
    resend_request(
        "PATCH",
        f"/domains/{domain.get('id')}",
        {"open_tracking": True, "click_tracking": True},
    )


def ensure_resend_tracking() -> None:
    global RESEND_TRACKING_READY, RESEND_TRACKING_ERROR
    if RESEND_TRACKING_READY:
        return
    if RESEND_TRACKING_ERROR:
        raise HTTPException(status_code=502, detail=RESEND_TRACKING_ERROR)
    try:
        enable_resend_tracking()
        RESEND_TRACKING_READY = True
    except HTTPException as exc:
        RESEND_TRACKING_ERROR = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        raise


def send_email(to_email: str, subject: str, text: str) -> None:
    ensure_resend_tracking()
    from_email = os.getenv("RESEND_FROM") or "verif@fashion-demon.shop"
    resend_request(
        "POST",
        "/emails",
        {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": text,
        },
    )


def generate_code() -> str:
    return f"{randbelow(1000000):06d}"


@app.post("/auth/signup")
def signup(payload: AuthPayload) -> Dict[str, Any]:
    email = payload.email.lower()
    existing = get_user_by_email(email)
    if existing and existing.get("verified"):
        raise HTTPException(status_code=409, detail="User already exists")
    if not existing:
        create_user(email, payload.password)
    code = generate_code()
    expires_at = int(time.time()) + 1200
    create_verification_code(email, code, "signup", expires_at)
    send_email(email, "Код подтверждения", f"Ваш код подтверждения: {code}")
    return {"verificationRequired": True}


@app.post("/auth/resend")
def resend_code(payload: ResetRequestPayload) -> Dict[str, Any]:
    email = payload.email.lower()
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("verified"):
        raise HTTPException(status_code=400, detail="User already verified")
        
    code = generate_code()
    expires_at = int(time.time()) + 1200
    create_verification_code(email, code, "signup", expires_at)
    send_email(email, "Код подтверждения", f"Ваш код подтверждения: {code}")
    return {"ok": True}


@app.post("/auth/verify")
def verify_signup(payload: VerifyPayload) -> Dict[str, Any]:
    email = payload.email.lower()
    code = payload.code.upper().strip()
    if not verify_code(email, code, "signup"):
        raise HTTPException(status_code=400, detail="Invalid code")
    set_verified(email)
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    default_nickname = f"user{user['id'][:6]}"
    upsert_profile(user["id"], email, None, None, None, default_nickname)
    token = create_session(user["id"])
    return {"token": token, "user": {"id": user["id"], "email": email}}


@app.post("/auth/login")
def login(payload: AuthPayload) -> Dict[str, Any]:
    email = payload.email.lower()
    user = get_user_by_email(email)
    if not user or not validate_password(email, payload.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("verified"):
        raise HTTPException(status_code=403, detail="Email not verified")
    token = create_session(user["id"])
    return {"token": token, "user": {"id": user["id"], "email": payload.email}}


@app.post("/admin/login")
def admin_login(payload: AuthPayload) -> Dict[str, Any]:
    creds = get_admin_credentials()
    if payload.email != creds["email"] or payload.password != creds["password"]:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    token = create_admin_session()
    return {"token": token}


@app.get("/admin/me")
def admin_me(request: Request) -> Dict[str, Any]:
    get_admin_user(request)
    return {"ok": True}


@app.post("/admin/logout")
def admin_logout(request: Request) -> Dict[str, Any]:
    token = request.headers.get("X-Admin-Token", "").strip()
    if token:
        delete_admin_session(token)
    return {"ok": True}


@app.post("/auth/logout")
def logout(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"ok": True}
    token = auth_header.replace("Bearer ", "").strip()
    delete_session(token)
    return {"ok": True}


@app.get("/auth/me")
def me(request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    profile = get_profile(user["id"])
    return {"user": {"id": user["id"], "email": user["email"]}, "profile": profile}


@app.post("/auth/reset/request")
def reset_request(payload: ResetRequestPayload) -> Dict[str, Any]:
    email = payload.email.lower()
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    code = generate_code()
    expires_at = int(time.time()) + 1200  # 20 minutes from now
    create_verification_code(email, code, "reset", expires_at)
    send_email(email, "Код для восстановления пароля", f"Ваш код для восстановления: {code}")
    return {"ok": True}


@app.post("/auth/reset/confirm")
def reset_confirm(payload: ResetConfirmPayload) -> Dict[str, Any]:
    email = payload.email.lower()
    code = payload.code.upper().strip()
    if not verify_code(email, code, "reset"):
        raise HTTPException(status_code=400, detail="Invalid code")
    set_password(email, payload.newPassword)
    return {"ok": True}


@app.get("/profile")
def profile(request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    profile_data = get_profile(user["id"])
    if profile_data:
        return profile_data
    default_nickname = f"user{user['id'][:6]}"
    return {"name": "", "phone": "", "shippingAddress": "", "email": user["email"], "nickname": default_nickname}


@app.post("/profile")
def update_profile(payload: ProfilePayload, request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    if payload.nickname:
        normalized = payload.nickname.strip()
        if normalized and is_nickname_taken(user["id"], normalized):
            raise HTTPException(status_code=400, detail="Nickname already taken")
    profile_data = upsert_profile(
        user["id"],
        user["email"],
        payload.name,
        payload.phone,
        payload.shippingAddress,
        payload.nickname.strip() if payload.nickname else None,
    )
    return profile_data


@app.get("/products")
def list_products() -> List[Dict[str, Any]]:
    return PRODUCTS


@app.post("/products")
def create_product(payload: ProductPayload, request: Request) -> Dict[str, Any]:
    get_admin_user(request)
    new_product = payload.dict()
    new_product["_id"] = token_urlsafe(10)
    new_product["likesCount"] = 0
    new_product["_creationTime"] = int(datetime.utcnow().timestamp() * 1000)
    PRODUCTS.append(new_product)
    save_products()
    return new_product


@app.get("/products/new")
def new_products() -> List[Dict[str, Any]]:
    return [p for p in PRODUCTS if p.get("isNew")]


@app.get("/products/popular")
def popular_products() -> List[Dict[str, Any]]:
    return sorted([p for p in PRODUCTS if p.get("isPopular")], key=lambda p: p.get("likesCount", 0), reverse=True)


@app.get("/products/{slug}")
def product_by_slug(slug: str) -> Dict[str, Any]:
    for product in PRODUCTS:
        if product.get("slug") == slug:
            return product
    raise HTTPException(status_code=404, detail="Product not found")


@app.patch("/products/{product_id}")
def update_product(product_id: str, payload: ProductUpdatePayload, request: Request) -> Dict[str, Any]:
    get_admin_user(request)
    for product in PRODUCTS:
        if product.get("_id") == product_id:
            updates = payload.dict(exclude_unset=True)
            product.update(updates)
            save_products()
            return product
    raise HTTPException(status_code=404, detail="Product not found")


@app.delete("/products/{product_id}")
def delete_product(product_id: str, request: Request) -> Dict[str, Any]:
    get_admin_user(request)
    global PRODUCTS
    PRODUCTS = [p for p in PRODUCTS if p.get("_id") != product_id]
    save_products()
    return {"ok": True}


@app.get("/products/category/{category}/new")
def new_products_in_category(category: str) -> List[Dict[str, Any]]:
    return [p for p in PRODUCTS if p.get("category") == category and p.get("isNew")]


@app.get("/products/category/{category}/popular")
def popular_products_in_category(category: str) -> List[Dict[str, Any]]:
    filtered = [p for p in PRODUCTS if p.get("category") == category and p.get("isPopular")]
    return sorted(filtered, key=lambda p: p.get("likesCount", 0), reverse=True)


@app.get("/cart")
def get_cart(request: Request) -> List[Dict[str, Any]]:
    user = get_current_user(request)
    return list_cart_items(user["id"], PRODUCTS)


@app.post("/cart")
def add_to_cart(payload: CartItemPayload, request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    for product in PRODUCTS:
        if product.get("_id") == payload.productId:
            size_stock = product.get("sizeStock") or {}
            if payload.size in size_stock:
                available = int(size_stock.get(payload.size, 0))
                if available <= 0:
                    raise HTTPException(status_code=400, detail="Size out of stock")
                # Check existing quantity in cart to enforce max per size
                conn = get_connection()
                row = conn.execute(
                    "SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?",
                    (user["id"], payload.productId, payload.size),
                ).fetchone()
                conn.close()
                existing_qty = row["quantity"] if row else 0
                if existing_qty + payload.quantity > available:
                    raise HTTPException(status_code=400, detail="Not enough stock")
            break
    return add_cart_item(user["id"], payload.productId, payload.size, payload.quantity, PRODUCTS)


@app.patch("/cart/{item_id}")
def update_cart(item_id: str, payload: CartUpdatePayload, request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT product_id, size FROM cart_items WHERE id = ? AND user_id = ?",
        (item_id, user["id"]),
    ).fetchone()
    conn.close()
    if row:
        product_id = row["product_id"]
        size = row["size"]
        for product in PRODUCTS:
            if product.get("_id") == product_id:
                size_stock = product.get("sizeStock") or {}
                if size in size_stock:
                    available = int(size_stock.get(size, 0))
                    if payload.quantity > available:
                        raise HTTPException(status_code=400, detail="Not enough stock")
                break
    return update_cart_item(user["id"], item_id, payload.quantity, PRODUCTS)


@app.delete("/cart/{item_id}")
def delete_cart_item_route(item_id: str, request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    delete_cart_item(user["id"], item_id)
    return {"ok": True}


@app.delete("/cart")
def clear_cart_route(request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    clear_cart(user["id"])
    return {"ok": True}


@app.get("/likes")
def get_likes(request: Request) -> List[Dict[str, Any]]:
    user = get_current_user(request)
    return list_likes(user["id"])


@app.post("/likes/toggle")
def toggle_like_route(payload: LikeTogglePayload, request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    return toggle_like(user["id"], payload.productId)


@app.post("/admin/upload")
def admin_upload(request: Request, files: List[UploadFile] = File(...)) -> Dict[str, Any]:
    get_admin_user(request)
    uploaded_urls = []
    for file in files:
        extension = Path(file.filename).suffix
        filename = f"{token_urlsafe(12)}{extension}"
        target_path = UPLOADS_DIR / filename
        with target_path.open("wb") as buffer:
            buffer.write(file.file.read())
        uploaded_urls.append(f"/uploads/{filename}")
    return {"urls": uploaded_urls}


@app.post("/upload")
def upload_media(request: Request, files: List[UploadFile] = File(...)) -> Dict[str, Any]:
    get_current_user(request)
    uploaded_urls = []
    for file in files:
        extension = Path(file.filename).suffix
        filename = f"{token_urlsafe(12)}{extension}"
        target_path = UPLOADS_DIR / filename
        with target_path.open("wb") as buffer:
            buffer.write(file.file.read())
        uploaded_urls.append(f"/uploads/{filename}")
    return {"urls": uploaded_urls}


@app.post("/products/{product_id}/reviews")
def add_review(product_id: str, payload: ReviewPayload, request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    profile = get_profile(user["id"])
    nickname = profile.get("nickname") if profile and profile.get("nickname") else f"user{user['id'][:6]}"
    for product in PRODUCTS:
        if product.get("_id") == product_id:
            review = {
                "id": token_urlsafe(8),
                "author": nickname,
                "date": datetime.utcnow().strftime("%d %B %H:%M"),
                "text": payload.text.strip(),
                "media": payload.media or [],
            }
            reviews = product.get("reviews") or []
            reviews.insert(0, review)
            product["reviews"] = reviews
            save_products()
            return review
    raise HTTPException(status_code=404, detail="Product not found")


@app.delete("/products/{product_id}/reviews/{review_id}")
def delete_review(product_id: str, review_id: str, request: Request) -> Dict[str, Any]:
    get_admin_user(request)
    for product in PRODUCTS:
        if product.get("_id") == product_id:
            reviews = product.get("reviews") or []
            product["reviews"] = [review for review in reviews if review.get("id") != review_id]
            save_products()
            return {"ok": True}
    raise HTTPException(status_code=404, detail="Product not found")


@app.get("/orders")
def get_orders(request: Request) -> List[Dict[str, Any]]:
    user = get_current_user(request)
    return list_orders(user["id"])


@app.post("/orders")
def create_order_route(payload: OrderPayload, request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    order_id = create_order(user["id"], payload.items, payload.totalAmount, payload.status)
    return {"id": order_id}
