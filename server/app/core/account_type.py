from __future__ import annotations

# Consumer / personal mailbox providers. Anything else with a real domain
# is treated as an office / work account (Google Workspace, Microsoft 365, custom).
PERSONAL_EMAIL_DOMAINS: frozenset[str] = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "yahoo.com",
        "yahoo.co.uk",
        "yahoo.co.in",
        "ymail.com",
        "outlook.com",
        "hotmail.com",
        "hotmail.co.uk",
        "live.com",
        "msn.com",
        "icloud.com",
        "me.com",
        "mac.com",
        "aol.com",
        "proton.me",
        "protonmail.com",
        "pm.me",
        "gmx.com",
        "gmx.de",
        "mail.com",
        "zoho.com",
        "yandex.com",
        "yandex.ru",
        "qq.com",
        "163.com",
        "126.com",
        "fastmail.com",
        "hey.com",
        "tutanota.com",
        "tutamail.com",
        "duck.com",
        "users.clerk.dev",
    }
)


def email_domain(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    domain = email.rsplit("@", 1)[-1].strip().lower()
    return domain or None


def is_office_email(email: str | None) -> bool:
    """True when the address looks like a work / school domain, not a personal mailbox."""
    domain = email_domain(email)
    if not domain or "." not in domain:
        return False
    return domain not in PERSONAL_EMAIL_DOMAINS


def classify_login_account(
    *,
    email: str | None,
    clerk_org_id: str | None,
) -> dict[str, str | bool | None]:
    """Classify the signed-in identity for product UI.

    - office email: company/school domain (not gmail/outlook personal, etc.)
    - organization workspace: active Clerk org vs personal workspace
    """
    domain = email_domain(email)
    office = is_office_email(email)
    in_org = bool(clerk_org_id)
    if office or in_org:
        account_kind = "office"
    else:
        account_kind = "personal"
    return {
        "account_kind": account_kind,
        "is_office_account": account_kind == "office",
        "is_office_email": office,
        "email_domain": domain,
        "workspace_kind": "organization" if in_org else "personal",
        "in_organization": in_org,
    }
