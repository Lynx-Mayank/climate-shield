import argparse
from datetime import datetime, timezone

from sqlalchemy import select

from .main import (
    AnalystScope,
    AuditRecord,
    GovernmentScope,
    LenderAccess,
    SessionLocal,
    User,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local ClimateShield account provisioning")
    subparsers = parser.add_subparsers(dest="command", required=True)
    approve = subparsers.add_parser("approve", help="Approve an analyst or government account")
    approve.add_argument("email")
    approve.add_argument("--scope", action="append", default=[], help="Authorized state; repeat for multiple states")
    link = subparsers.add_parser("link-lender", help="Authorize a lender to review an owner")
    link.add_argument("lender_email")
    link.add_argument("owner_email")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.command == "approve":
            user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
            if not user or user.role not in {"analyst", "government"}:
                raise SystemExit("Target must be an existing analyst or government account.")
            if not args.scope:
                raise SystemExit("At least one --scope state is required.")
            scope_model = AnalystScope if user.role == "analyst" else GovernmentScope
            foreign_key = (
                "analyst_user_id" if user.role == "analyst" else "government_user_id"
            )
            existing = {
                item.state.casefold()
                for item in db.scalars(
                    select(scope_model).where(getattr(scope_model, foreign_key) == user.id)
                ).all()
            }
            new_scopes = []
            for state in args.scope:
                normalized = state.strip()
                if not normalized:
                    continue
                if normalized.casefold() in existing:
                    continue
                new_scopes.append(
                    scope_model(**{foreign_key: user.id}, state=normalized)
                )
                existing.add(normalized.casefold())
            if not new_scopes:
                raise SystemExit("No new non-empty scopes were supplied.")
            user.is_approved = True
            db.add_all(new_scopes)
            db.add(
                AuditRecord(
                    actor_label="local-administrator-cli",
                    action="sensitive_account_approval_and_scope_assignment",
                    target=f"user:{user.id}",
                    details={"role": user.role, "states": [item.state for item in new_scopes]},
                    created_at=datetime.now(timezone.utc),
                )
            )
            db.commit()
            print(f"Approved {user.email} as {user.role}; assigned {len(new_scopes)} state scope(s).")
            return

        lender = db.scalar(
            select(User).where(User.email == args.lender_email.strip().lower())
        )
        owner = db.scalar(select(User).where(User.email == args.owner_email.strip().lower()))
        if not lender or lender.role != "lender" or not lender.is_approved:
            raise SystemExit("Lender email must identify an approved lender account.")
        if not owner or owner.role != "owner" or not owner.is_approved:
            raise SystemExit("Owner email must identify an approved owner account.")
        exists = db.scalar(
            select(LenderAccess).where(
                LenderAccess.lender_user_id == lender.id,
                LenderAccess.owner_user_id == owner.id,
            )
        )
        if exists:
            print("This lender-owner access link already exists.")
            return
        db.add(LenderAccess(lender_user_id=lender.id, owner_user_id=owner.id))
        db.add(
            AuditRecord(
                actor_label="local-administrator-cli",
                action="lender_borrower_access_granted",
                target=f"lender:{lender.id}/owner:{owner.id}",
                details={},
            )
        )
        db.commit()
        print(f"Linked lender {lender.email} to owner {owner.email}.")


if __name__ == "__main__":
    main()
