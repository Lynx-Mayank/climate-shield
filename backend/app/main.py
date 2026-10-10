import hashlib
import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Literal
import csv
import io

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, create_engine, func, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .scoring import VULNERABILITY_WEIGHTS, assess_risk

BASE_DIR = Path(__file__).resolve().parents[1]
DATABASE_URL = os.getenv(
    "CLIMATESHIELD_DATABASE_URL",
    f"sqlite:///{(BASE_DIR / 'climateshield.db').as_posix()}",
)
SESSION_COOKIE = "climateshield_session"
SESSION_DAYS = 7
COOKIE_SECURE = os.getenv("CLIMATESHIELD_COOKIE_SECURE", "false").lower() == "true"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CLIMATESHIELD_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8443,http://127.0.0.1:8443",
    ).split(",")
    if origin.strip()
]

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(10))
    organization_name: Mapped[str] = mapped_column(String(160), default="")
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AuthSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BusinessProfile(Base):
    __tablename__ = "business_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    profile: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class LenderAccess(Base):
    __tablename__ = "lender_access"

    id: Mapped[int] = mapped_column(primary_key=True)
    lender_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class AnalystScope(Base):
    __tablename__ = "analyst_scopes"

    id: Mapped[int] = mapped_column(primary_key=True)
    analyst_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    state: Mapped[str] = mapped_column(String(100), index=True)


class GovernmentScope(Base):
    __tablename__ = "government_scopes"

    id: Mapped[int] = mapped_column(primary_key=True)
    government_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    state: Mapped[str] = mapped_column(String(100), index=True)


class PolicyProgram(Base):
    __tablename__ = "policy_programs"

    id: Mapped[int] = mapped_column(primary_key=True)
    government_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(String(3000))
    scope_state: Mapped[str] = mapped_column(String(100), index=True)
    target_industries: Mapped[list] = mapped_column(JSON, default=list)
    climate_hazard: Mapped[str] = mapped_column(String(80))
    start_date: Mapped[date] = mapped_column()
    end_date: Mapped[date] = mapped_column()
    program_status: Mapped[str] = mapped_column(String(20), default="Draft")
    target_businesses: Mapped[int] = mapped_column(default=0)
    budget: Mapped[float | None] = mapped_column(nullable=True)
    eligibility_criteria: Mapped[str] = mapped_column(String(2000), default="")
    progress_notes: Mapped[str] = mapped_column(String(4000), default="")
    participant_count: Mapped[int] = mapped_column(default=0)
    outcomes: Mapped[dict] = mapped_column(JSON, default=dict)
    baseline: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AuditRecord(Base):
    __tablename__ = "audit_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    actor_label: Mapped[str] = mapped_column(String(180), default="authorized-user")
    action: Mapped[str] = mapped_column(String(100))
    target: Mapped[str] = mapped_column(String(180))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)
    role: Literal["owner", "lender", "analyst", "government"]
    organization_name: str = Field(default="", max_length=160)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)
    role: Literal["owner", "lender", "analyst", "government"] | None = None


class ProgramRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=3000)
    scope_state: str = Field(min_length=1, max_length=100)
    target_industries: list[str] = Field(default_factory=list, max_length=40)
    climate_hazard: str = Field(min_length=1, max_length=80)
    start_date: date
    end_date: date
    program_status: Literal["Draft", "Planned", "Active", "Completed", "Archived"]
    target_businesses: int = Field(default=0, ge=0, le=10_000_000)
    budget: float | None = Field(default=None, ge=0, le=10_000_000_000_000)
    eligibility_criteria: str = Field(default="", max_length=2000)
    progress_notes: str = Field(default="", max_length=4000)
    participant_count: int = Field(default=0, ge=0, le=10_000_000)
    outcomes: dict[str, float | str | None] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("Program end date must be on or after its start date.")
        return self


class ProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    industry: str = Field(min_length=1, max_length=100)
    address: str = Field(default="", max_length=300)
    city: str = Field(default="", max_length=100)
    state: str = Field(default="", max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    size: str = Field(default="", max_length=80)
    employee_range: str = Field(default="", max_length=80)
    activities: str = Field(default="", max_length=2000)
    assets: str = Field(default="", max_length=2000)
    operating_hours: str = Field(default="", max_length=200)
    protective_measures: str = Field(default="", max_length=2000)


class RiskRequest(BaseModel):
    hazards: dict[str, float | None]
    vulnerability_factors: dict[str, float | None]
    resilience: float | None = Field(default=None, ge=0, le=100)
    financials: dict[str, float | None] = Field(default_factory=dict)
    calibration: dict[str, float | None] = Field(default_factory=dict)
    source_provenance: dict[str, Any] = Field(default_factory=dict)
    model_version: str = Field(default="climateshield-prototype-v3", max_length=80)

    @field_validator("hazards", "vulnerability_factors", "calibration")
    @classmethod
    def validate_scores(cls, values: dict[str, float | None]):
        if any(value is not None and not 0 <= value <= 100 for value in values.values()):
            raise ValueError("Risk input scores and calibration values must be between 0 and 100.")
        return values

    @field_validator("financials")
    @classmethod
    def validate_financials(cls, values: dict[str, float | None]):
        allowed = {"monthly_revenue", "monthly_operating_costs"}
        if set(values) - allowed:
            raise ValueError("Financial inputs contain unsupported fields.")
        if any(value is not None and value < 0 for value in values.values()):
            raise ValueError("Financial inputs must be zero or greater.")
        return values

    @model_validator(mode="after")
    def validate_factor_names(self):
        allowed_hazards = {"flood", "rainfall", "heat", "drought"}
        unknown_hazards = set(self.hazards) - allowed_hazards
        unknown_factors = set(self.vulnerability_factors) - set(VULNERABILITY_WEIGHTS)
        unknown_calibration = set(self.calibration) - {
            "historical_flood_index",
            "historical_drought_index",
        }
        if unknown_hazards or unknown_factors or unknown_calibration:
            raise ValueError("Risk inputs contain unsupported factor names.")
        return self

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt$16384$8$1${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, digest_hex = encoded.split("$")
        if scheme != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
        )
        return secrets.compare_digest(actual.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "organization_name": user.organization_name,
        "is_approved": user.is_approved,
    }


def create_session(user: User, response: Response, db: Session) -> None:
    raw_token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        )
    )
    response.set_cookie(
        SESSION_COOKIE,
        raw_token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    raw_token = request.cookies.get(SESSION_COOKIE)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in is required.")
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    auth_session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash))
    if not auth_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is invalid.")
    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        db.delete(auth_session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has expired.")
    user = db.get(User, auth_session.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session user no longer exists.")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is pending administrator approval.")
    return user


def require_role(role: Literal["owner", "lender"]):
    def dependency(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role != role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account role cannot access this resource.")
        return user

    return dependency


Owner = Annotated[User, Depends(require_role("owner"))]
Lender = Annotated[User, Depends(require_role("lender"))]
Analyst = Annotated[User, Depends(require_role("analyst"))]
Government = Annotated[User, Depends(require_role("government"))]
Database = Annotated[Session, Depends(get_db)]

app = FastAPI(title="ClimateShield MSME API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.on_event("startup")
def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "is_approved" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT 1"))


@app.get("/api/health")
def health(db: Database):
    db.execute(select(1))
    return {"status": "ok", "database": "connected"}


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: Database):
    email = payload.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        organization_name=payload.organization_name.strip(),
        is_approved=payload.role in {"owner", "lender"},
    )
    db.add(user)
    db.flush()
    if user.is_approved:
        create_session(user, response, db)
    db.commit()
    return {
        "user": public_user(user),
        "approval_required": not user.is_approved,
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response, db: Database):
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    if payload.role and user.role != payload.role:
        raise HTTPException(status_code=403, detail="This account belongs to a different account type.")
    if not user.is_approved:
        raise HTTPException(
            status_code=403,
            detail="Your analyst or government account is pending administrator approval.",
        )
    create_session(user, response, db)
    db.commit()
    return {"user": public_user(user)}


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Database):
    raw_token = request.cookies.get(SESSION_COOKIE)
    if raw_token:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        auth_session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash))
        if auth_session:
            db.delete(auth_session)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")


@app.get("/api/auth/me")
def get_current_user(user: Annotated[User, Depends(current_user)]):
    return {"user": public_user(user)}


@app.get("/api/business/profile")
def get_profile(user: Owner, db: Database):
    record = db.scalar(select(BusinessProfile).where(BusinessProfile.user_id == user.id))
    if not record:
        raise HTTPException(status_code=404, detail="No business profile has been saved.")
    return {"profile": record.profile, "updated_at": record.updated_at}


@app.put("/api/business/profile")
def save_profile(payload: ProfileRequest, user: Owner, db: Database):
    record = db.scalar(select(BusinessProfile).where(BusinessProfile.user_id == user.id))
    if record:
        record.profile = payload.model_dump()
        record.updated_at = datetime.now(timezone.utc)
    else:
        record = BusinessProfile(user_id=user.id, profile=payload.model_dump())
        db.add(record)
    db.commit()
    return {"profile": record.profile, "updated_at": record.updated_at}


@app.post("/api/business/assessments", status_code=status.HTTP_201_CREATED)
def create_assessment(payload: RiskRequest, user: Owner, db: Database):
    result = assess_risk(
        payload.hazards,
        payload.vulnerability_factors,
        payload.resilience,
        payload.financials,
        payload.calibration,
    )
    result["created_at"] = datetime.now(timezone.utc).isoformat()
    result["source_provenance"] = payload.source_provenance
    result["model_version"] = payload.model_version
    record = Assessment(user_id=user.id, result=result)
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "result": result}


@app.get("/api/business/assessments")
def list_assessments(user: Owner, db: Database):
    records = db.scalars(
        select(Assessment)
        .where(Assessment.user_id == user.id)
        .order_by(Assessment.created_at.desc())
    ).all()
    return {"items": [{"id": item.id, "result": item.result, "created_at": item.created_at} for item in records]}


def lender_assessments(user: User, db: Session):
    accessible = select(LenderAccess.owner_user_id).where(LenderAccess.lender_user_id == user.id)
    return db.execute(
        select(Assessment, BusinessProfile)
        .join(BusinessProfile, BusinessProfile.user_id == Assessment.user_id)
        .where(Assessment.user_id.in_(accessible))
        .order_by(Assessment.created_at.desc())
    ).all()


def filtered_lender_assessments(
    user: User,
    db: Session,
    *,
    industry: str | None = None,
    category: Literal["Low", "Moderate", "High", "Critical", "Unavailable"] | None = None,
    hazard: Literal["flood", "rainfall", "heat", "drought"] | None = None,
) -> list[tuple[Assessment, dict, dict]]:
    records = lender_assessments(user, db)
    filtered = []
    for assessment, profile in records:
        business = profile.profile
        result = assessment.result
        if industry and business.get("industry") != industry:
            continue
        if category and (result.get("category") or "Unavailable") != category:
            continue
        if hazard and (result.get("hazards") or {}).get(hazard) is None:
            continue
        filtered.append((assessment, business, result))
    return filtered


def lender_csv_rows(records: list[tuple[Assessment, dict, dict]]) -> list[dict]:
    return [
        {
            "assessment_id": assessment.id,
            "created_at": assessment.created_at.isoformat(),
            "business_name": business.get("name", ""),
            "industry": business.get("industry", ""),
            "city": business.get("city", ""),
            "state": business.get("state", ""),
            "overall_score": result.get("score"),
            "category": result.get("category") or "Unavailable",
            "completeness": result.get("completeness"),
            "hazard_flood": (result.get("hazards") or {}).get("flood"),
            "hazard_rainfall": (result.get("hazards") or {}).get("rainfall"),
            "hazard_heat": (result.get("hazards") or {}).get("heat"),
            "hazard_drought": (result.get("hazards") or {}).get("drought"),
            "model_version": result.get("model_version", ""),
            "source": (result.get("source_provenance") or {}).get("source", ""),
        }
        for assessment, business, result in records
    ]


@app.get("/api/lender/portfolio")
def lender_portfolio(
    user: Lender,
    db: Database,
    industry: str | None = None,
    category: Literal["Low", "Moderate", "High", "Critical", "Unavailable"] | None = None,
    hazard: Literal["flood", "rainfall", "heat", "drought"] | None = None,
):
    records = filtered_lender_assessments(
        user, db, industry=industry, category=category, hazard=hazard
    )
    return {
        "items": [
            {
                "id": assessment.id,
                "business": {
                    "name": business.get("name", ""),
                    "industry": business.get("industry", ""),
                    "city": business.get("city", ""),
                    "state": business.get("state", ""),
                },
                "result": result,
                "created_at": assessment.created_at,
            }
            for assessment, business, result in records
        ]
    }


@app.get("/api/lender/export.csv")
def lender_export(
    user: Lender,
    db: Database,
    industry: str | None = None,
    category: Literal["Low", "Moderate", "High", "Critical", "Unavailable"] | None = None,
    hazard: Literal["flood", "rainfall", "heat", "drought"] | None = None,
):
    records = filtered_lender_assessments(
        user, db, industry=industry, category=category, hazard=hazard
    )
    return make_csv_response(
        lender_csv_rows(records), "climateshield-authorized-lender-assessments.csv"
    )


def analyst_records(
    user: User,
    db: Session,
    *,
    state_filter: str | None = None,
    industry_filter: str | None = None,
    hazard_filter: str | None = None,
    since: date | None = None,
    until: date | None = None,
):
    permitted_states = {
        item.state
        for item in db.scalars(
            select(AnalystScope).where(AnalystScope.analyst_user_id == user.id)
        ).all()
    }
    if state_filter and state_filter not in permitted_states:
        raise HTTPException(status_code=403, detail="The requested state is outside your analyst scope.")
    query = (
        select(Assessment, BusinessProfile)
        .join(BusinessProfile, BusinessProfile.user_id == Assessment.user_id)
        .where(Assessment.created_at >= datetime.combine(since, datetime.min.time(), timezone.utc) if since else True)
        .where(Assessment.created_at <= datetime.combine(until, datetime.max.time(), timezone.utc) if until else True)
        .order_by(Assessment.created_at.desc())
    )
    records = []
    for assessment, profile_row in db.execute(query).all():
        profile = profile_row.profile
        state = str(profile.get("state", "")).strip()
        industry = str(profile.get("industry", "")).strip()
        result = assessment.result
        if state not in permitted_states:
            continue
        if state_filter and state.casefold() != state_filter.casefold():
            continue
        if industry_filter and industry.casefold() != industry_filter.casefold():
            continue
        if hazard_filter and (result.get("hazards") or {}).get(hazard_filter) is None:
            continue
        records.append({
            "id": assessment.id,
            "created_at": assessment.created_at.isoformat(),
            "location": {
                "state": state,
                "city": profile.get("city") or None,
                "latitude": profile.get("latitude"),
                "longitude": profile.get("longitude"),
            },
            "business": {
                "name": profile.get("name", "Business"),
                "industry": industry or "Unspecified",
            },
            "result": result,
        })
    return records, permitted_states


def latest_assessment_list(records: list[dict]) -> list[dict]:
    return [
        {
            "id": record["id"],
            "created_at": record["created_at"],
            "state": record["location"]["state"],
            "industry": record["business"]["industry"],
            "score": record["result"].get("score"),
            "category": record["result"].get("category"),
            "completeness": record["result"].get("completeness"),
            "hazards": record["result"].get("hazards", {}),
        }
        for record in records
    ]


def make_csv_response(rows: list[dict], filename: str) -> Response:
    output = io.StringIO(newline="")
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        for row in rows:
            safe_row = {
                key: (
                    "'" + value
                    if isinstance(value, str) and value.startswith(("=", "+", "-", "@"))
                    else value
                )
                for key, value in row.items()
            }
            writer.writerow(safe_row)
    return Response(
        output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def government_scopes(user: User, db: Session) -> set[str]:
    return {
        item.state
        for item in db.scalars(
            select(GovernmentScope).where(GovernmentScope.government_user_id == user.id)
        ).all()
    }


def scoped_regional_records(user: User, db: Session, state_filter: str | None = None):
    permitted_states = government_scopes(user, db)
    if state_filter and state_filter not in permitted_states:
        raise HTTPException(status_code=403, detail="The requested state is outside your government scope.")
    if not permitted_states:
        return [], permitted_states
    query = (
        select(Assessment, BusinessProfile)
        .join(BusinessProfile, BusinessProfile.user_id == Assessment.user_id)
        .order_by(Assessment.created_at.desc())
    )
    records = []
    for assessment, profile_row in db.execute(query).all():
        profile = profile_row.profile
        state = str(profile.get("state", "")).strip()
        if state not in permitted_states or (state_filter and state.casefold() != state_filter.casefold()):
            continue
        records.append({
            "assessment": assessment,
            "profile": profile,
            "state": state,
        })
    return records, permitted_states


def latest_per_business(records: list[dict]) -> list[dict]:
    latest: dict[int, dict] = {}
    for record in records:
        owner_id = record["assessment"].user_id
        current = latest.get(owner_id)
        if current is None or record["assessment"].created_at > current["assessment"].created_at:
            latest[owner_id] = record
    return list(latest.values())


def program_payload(program: PolicyProgram, *, include_notes: bool = True) -> dict:
    return {
        "id": program.id,
        "name": program.name,
        "description": program.description,
        "scope_state": program.scope_state,
        "target_industries": program.target_industries,
        "climate_hazard": program.climate_hazard,
        "start_date": program.start_date.isoformat(),
        "end_date": program.end_date.isoformat(),
        "program_status": program.program_status,
        "target_businesses": program.target_businesses,
        "budget": program.budget,
        "eligibility_criteria": program.eligibility_criteria,
        "progress_notes": program.progress_notes if include_notes else "",
        "participant_count": program.participant_count,
        "outcomes": program.outcomes,
        "baseline": program.baseline,
        "created_at": program.created_at.isoformat(),
        "updated_at": program.updated_at.isoformat(),
        "data_label": "Entered by an authorized ClimateShield user; not an automatically verified government scheme.",
    }


def calculate_regional_summary(records: list[dict]) -> dict:
    distribution: dict[str, int] = {}
    industries: dict[str, list[int]] = {}
    hazards: dict[str, list[float]] = {}
    states: dict[str, int] = {}
    monthly_scores: dict[str, dict[int, int]] = {}
    date_values = []
    completeness_values = []
    for record in records:
        result = record["assessment"].result
        category = result.get("category") or "Unavailable"
        distribution[category] = distribution.get(category, 0) + 1
        state = record["state"]
        states[state] = states.get(state, 0) + 1
        industry = str(record["profile"].get("industry") or "Unspecified")
        industries.setdefault(industry, []).append(result["score"]) if result.get("score") is not None else None
        completeness = result.get("completeness")
        if completeness is not None:
            completeness_values.append(completeness)
        date_values.append(record["assessment"].created_at)
        if result.get("score") is not None:
            month = record["assessment"].created_at.strftime("%Y-%m")
            monthly_scores.setdefault(month, {}).setdefault(
                record["assessment"].user_id, result["score"]
            )
        for hazard, score in (result.get("hazards") or {}).items():
            if score is not None:
                hazards.setdefault(hazard, []).append(float(score))
    assessed = len(records)
    latest = max(date_values).isoformat() if date_values else None
    return {
        "assessment_count": assessed,
        "states_covered": sorted(states),
        "state_counts": states,
        "assessment_trends": [
            {
                "month": month,
                "average_score": round(sum(scores.values()) / len(scores), 1),
                "business_count": len(scores),
            }
            for month, scores in sorted(monthly_scores.items())
            if len(scores) >= 5
        ],
        "risk_distribution": distribution,
        "industry_average_scores": {
            name: round(sum(scores) / len(scores), 1)
            for name, scores in industries.items()
            if scores
        },
        "average_hazards": {
            name: round(sum(scores) / len(scores), 1)
            for name, scores in hazards.items()
            if scores
        },
        "average_completeness": round(sum(completeness_values) / len(completeness_values), 1) if completeness_values else None,
        "latest_assessment": latest,
        "data_freshness": "Assessment timestamp shown; climate-source freshness is not available unless explicitly provided by the source.",
    }


def apply_government_privacy(summary: dict, records: list[dict]) -> dict:
    record_count = len(records)
    if record_count < 5:
        summary["assessment_count"] = None
        summary["states_covered"] = []
        summary["state_counts"] = {}
        summary["assessment_trends"] = []
        summary["risk_distribution"] = {}
        summary["industry_average_scores"] = {}
        summary["average_hazards"] = {}
        summary["average_completeness"] = None
        summary["latest_assessment"] = None
        summary["privacy_suppressed"] = True
    else:
        summary["risk_distribution"] = {
            category: count for category, count in summary["risk_distribution"].items()
            if count >= 5
        }
        summary["state_counts"] = {
            state: count for state, count in summary["state_counts"].items()
            if count >= 5
        }
        summary["states_covered"] = sorted(summary["state_counts"])
        hazard_support: dict[str, list[float]] = {}
        for record in records:
            for key, value in (record["assessment"].result.get("hazards") or {}).items():
                if value is not None:
                    hazard_support.setdefault(key, []).append(float(value))
        summary["average_hazards"] = {
            key: summary["average_hazards"][key]
            for key, values in hazard_support.items()
            if len(values) >= 5 and key in summary["average_hazards"]
        }
        summary["privacy_suppressed"] = False
    return summary


@app.get("/api/analyst/overview")
def analyst_overview(user: Analyst, db: Database):
    records, states = analyst_records(user, db)
    summary = calculate_regional_summary([
        {
            "assessment": record_obj,
            "profile": profile.profile,
            "state": str(profile.profile.get("state", "")).strip(),
        }
        for record_obj, profile in db.execute(
            select(Assessment, BusinessProfile)
            .join(BusinessProfile, BusinessProfile.user_id == Assessment.user_id)
            .order_by(Assessment.created_at.desc())
        ).all()
        if str(profile.profile.get("state", "")).strip() in states
    ])
    summary["assessments_available"] = len(records)
    summary["data_sources"] = ["Saved prototype assessment inputs", "Open-Meteo provenance only where supplied at assessment time"]
    summary["recent_assessments"] = latest_assessment_list(records[:10])
    return summary


@app.get("/api/analyst/assessments")
def analyst_assessments(
    user: Analyst,
    db: Database,
    state: str | None = None,
    industry: str | None = None,
    hazard: Literal["flood", "rainfall", "heat", "drought"] | None = None,
    since: date | None = None,
    until: date | None = None,
):
    records, permitted_states = analyst_records(
        user, db, state_filter=state, industry_filter=industry,
        hazard_filter=hazard, since=since, until=until,
    )
    return {
        "items": records,
        "states": sorted(permitted_states),
        "industries": sorted({item["business"]["industry"] for item in records}),
        "hazards": ["flood", "rainfall", "heat", "drought"],
        "filter_note": "Only assessments in explicitly assigned analyst states are included. Financial fields and account contact details are excluded.",
    }


@app.get("/api/analyst/export.csv")
def analyst_export(
    user: Analyst,
    db: Database,
    state: str | None = None,
    industry: str | None = None,
    hazard: Literal["flood", "rainfall", "heat", "drought"] | None = None,
    since: date | None = None,
    until: date | None = None,
):
    records, _ = analyst_records(
        user, db, state_filter=state, industry_filter=industry,
        hazard_filter=hazard, since=since, until=until,
    )
    rows = [
        {
            "assessment_id": record["id"],
            "created_at": record["created_at"],
            "business_name": record["business"]["name"],
            "industry": record["business"]["industry"],
            "state": record["location"]["state"],
            "overall_score": record["result"].get("score"),
            "category": record["result"].get("category"),
            "completeness": record["result"].get("completeness"),
            **{
                f"hazard_{key}": value
                for key, value in (record["result"].get("hazards") or {}).items()
            },
            "model_version": record["result"].get("model_version"),
            "source_provenance": str(record["result"].get("source_provenance", {})),
        }
        for record in records
    ]
    return make_csv_response(rows, "climateshield-analyst-assessments.csv")


@app.get("/api/government/overview")
def government_overview(user: Government, db: Database, state: str | None = None):
    assessment_records, permitted_states = scoped_regional_records(user, db, state)
    records = latest_per_business(assessment_records)
    summary = apply_government_privacy(
        calculate_regional_summary(records), records
    )
    summary["assessment_trends"] = calculate_regional_summary(assessment_records)["assessment_trends"]
    summary["authorized_states"] = sorted(permitted_states)
    elevated_count = (
        sum(
            1 for item in records
            if item["assessment"].result.get("score") is not None
            and item["assessment"].result["score"] >= 50
        )
        if not summary["privacy_suppressed"] else None
    )
    summary["elevated_assessment_count"] = (
        elevated_count if elevated_count is not None and elevated_count >= 5 else None
    )
    if not summary["privacy_suppressed"]:
        summary["industry_average_scores"] = {
            industry: {"average_score": average, "assessment_count": sum(
                1 for item in records
                if (item["profile"].get("industry") or "Unspecified") == industry
            )}
            for industry, average in summary["industry_average_scores"].items()
            if sum(1 for item in records if (item["profile"].get("industry") or "Unspecified") == industry) >= 5
        }
    summary["privacy_threshold"] = 5
    return summary


@app.get("/api/government/map")
def government_map(
    user: Government,
    db: Database,
    state: str | None = None,
    hazard: Literal["flood", "rainfall", "heat", "drought"] | None = None,
):
    assessment_records, _ = scoped_regional_records(user, db, state)
    records = latest_per_business(assessment_records)
    groups: dict[tuple[int, int, str], list[dict]] = {}
    for item in records:
        latitude = item["profile"].get("latitude")
        longitude = item["profile"].get("longitude")
        if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
            continue
        result = item["assessment"].result
        hazard_values = result.get("hazards") or {}
        score = hazard_values.get(hazard) if hazard else result.get("score")
        if score is None:
            continue
        # Coarsen coordinates before aggregation; never return a business marker.
        key = (round(latitude * 4), round(longitude * 4), item["state"])
        groups.setdefault(key, []).append({"score": float(score), "category": result.get("category")})
    cells = []
    for (lat_bin, lon_bin, state_name), members in groups.items():
        if len(members) < 5:
            continue
        cells.append({
            "latitude": lat_bin / 4,
            "longitude": lon_bin / 4,
            "state": state_name,
            "business_count": len(members),
            "average_score": round(sum(item["score"] for item in members) / len(members), 1),
            "risk_distribution": {
                category: sum(item["category"] == category for item in members)
                for category in ("Low", "Moderate", "High", "Critical")
                if sum(item["category"] == category for item in members) >= 5
            },
        })
    return {
        "cells": cells,
        "privacy_threshold": 5,
        "explanation": "Coarse 0.25-degree coordinate cells are returned only when at least five assessments contribute. This is an approximate display cell, not a district boundary or official hazard polygon.",
    }


@app.get("/api/government/programs")
def list_programs(user: Government, db: Database, state: str | None = None):
    permitted_states = government_scopes(user, db)
    if state and state not in permitted_states:
        raise HTTPException(status_code=403, detail="The requested state is outside your government scope.")
    query = select(PolicyProgram).where(PolicyProgram.scope_state.in_(permitted_states))
    if state:
        query = query.where(PolicyProgram.scope_state == state)
    programs = db.scalars(query.order_by(PolicyProgram.updated_at.desc())).all()
    return {
        "items": [program_payload(item) for item in programs],
        "authorized_states": sorted(permitted_states),
    }


@app.post("/api/government/programs", status_code=status.HTTP_201_CREATED)
def create_program(payload: ProgramRequest, user: Government, db: Database):
    if payload.scope_state not in government_scopes(user, db):
        raise HTTPException(status_code=403, detail="You may only create programs inside your assigned state scope.")
    regional_records, _ = scoped_regional_records(user, db, payload.scope_state)
    baseline_records = latest_per_business([
        item for item in regional_records
        if item["assessment"].created_at.date() < payload.start_date
    ])
    scores = [
        item["assessment"].result["score"]
        for item in baseline_records
        if item["assessment"].result.get("score") is not None
    ]
    baseline = {
        "assessment_count": len(scores) if len(scores) >= 5 else None,
        "average_risk_score": round(sum(scores) / len(scores), 1) if len(scores) >= 5 else None,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "limitation": "Descriptive baseline from assessments dated before program start; values are suppressed below five assessments and are not causal evidence.",
    }
    program = PolicyProgram(
        government_user_id=user.id,
        **payload.model_dump(),
        baseline=baseline,
    )
    db.add(program)
    db.flush()
    db.add(AuditRecord(
        actor_user_id=user.id,
        action="policy_program_created",
        target=f"program:{program.id}",
        details={"state": program.scope_state, "status": program.program_status},
    ))
    db.commit()
    db.refresh(program)
    return program_payload(program)


@app.patch("/api/government/programs/{program_id}")
def update_program(program_id: int, payload: ProgramRequest, user: Government, db: Database):
    program = db.get(PolicyProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Policy program not found.")
    if program.scope_state not in government_scopes(user, db) or payload.scope_state != program.scope_state:
        raise HTTPException(status_code=403, detail="You may only manage programs within their originally assigned state scope.")
    prior_status = program.program_status
    for key, value in payload.model_dump().items():
        setattr(program, key, value)
    program.updated_at = datetime.now(timezone.utc)
    db.add(AuditRecord(
        actor_user_id=user.id,
        action="policy_program_updated",
        target=f"program:{program.id}",
        details={"state": program.scope_state, "previous_status": prior_status, "status": program.program_status},
    ))
    db.commit()
    db.refresh(program)
    return program_payload(program)


@app.get("/api/government/programs/{program_id}/impact")
def program_impact(program_id: int, user: Government, db: Database):
    program = db.get(PolicyProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Policy program not found.")
    if program.scope_state not in government_scopes(user, db):
        raise HTTPException(status_code=403, detail="This program is outside your government scope.")
    regional_records, _ = scoped_regional_records(user, db, program.scope_state)
    before_records = latest_per_business([
        item for item in regional_records
        if item["assessment"].created_at.date() < program.start_date
    ])
    after_records = latest_per_business([
        item for item in regional_records
        if item["assessment"].created_at.date() >= program.start_date
    ])
    after_scores = [
        item["assessment"].result["score"]
        for item in after_records
        if item["assessment"].result.get("score") is not None
    ]
    before_scores = [
        item["assessment"].result["score"]
        for item in before_records
        if item["assessment"].result.get("score") is not None
    ]
    after_average = (
        round(sum(after_scores) / len(after_scores), 1)
        if len(after_scores) >= 5 else None
    )
    before_average = (
        round(sum(before_scores) / len(before_scores), 1)
        if len(before_scores) >= 5 else program.baseline.get("average_risk_score")
    )
    return {
        "program": program_payload(program),
        "coverage": {
            "target_businesses": program.target_businesses,
            "entered_participant_count": program.participant_count if program.participant_count >= 5 else None,
            "assessment_count_after_start": len(after_scores) if len(after_scores) >= 5 else None,
        },
        "risk_indicators": {
            "baseline_average": before_average,
            "subsequent_average": after_average,
            "descriptive_change": round(after_average - before_average, 1) if after_average is not None and before_average is not None else None,
            "baseline_period": f"Before {program.start_date.isoformat()}",
            "subsequent_period": f"From {program.start_date.isoformat()} to present",
        },
        "reported_outcomes": program.outcomes,
        "data_completeness": calculate_regional_summary(latest_per_business(regional_records))["average_completeness"] if len(latest_per_business(regional_records)) >= 5 else None,
        "limitation": "Descriptive before/after indicator only. Program participation and causation are not independently verified; means are suppressed when fewer than five assessments are available.",
    }


@app.get("/api/government/reports.csv")
def government_report(user: Government, db: Database, state: str | None = None):
    records, _ = scoped_regional_records(user, db, state)
    summary = apply_government_privacy(calculate_regional_summary(records), records)
    if summary["privacy_suppressed"]:
        categories = [("Suppressed (<5)", None)]
    else:
        categories = [
            (category, count if count >= 5 else None)
            for category, count in summary["risk_distribution"].items()
        ]
    rows = [{
        "geographic_scope": state or "; ".join(summary["states_covered"]) or "Authorized scope",
        "reporting_period_start": min((item["assessment"].created_at.date() for item in records), default=""),
        "reporting_period_end": max((item["assessment"].created_at.date() for item in records), default=""),
        "assessed_businesses": summary["assessment_count"],
        "risk_category": category,
        "business_count": count,
        "average_data_completeness": summary["average_completeness"],
        "data_limitations": "Groups below five are suppressed. State filters use explicit provisioned scope; this is not a district estimate, causal evaluation, official hazard finding, or verified scheme outcome.",
    } for category, count in categories]
    permitted_states = government_scopes(user, db)
    programs = db.scalars(
        select(PolicyProgram).where(PolicyProgram.scope_state.in_(permitted_states))
    ).all()
    rows.extend({
        "geographic_scope": program.scope_state,
        "reporting_period_start": program.start_date.isoformat(),
        "reporting_period_end": program.end_date.isoformat(),
        "assessed_businesses": None,
        "risk_category": f"Policy program: {program.name} ({program.program_status})",
        "business_count": program.participant_count if program.participant_count >= 5 else None,
        "average_data_completeness": None,
        "data_limitations": "Program progress is user-entered and not automatically verified; participation below five is suppressed.",
    } for program in programs if not state or program.scope_state.casefold() == state.casefold())
    return make_csv_response(rows, "climateshield-regional-summary.csv")
