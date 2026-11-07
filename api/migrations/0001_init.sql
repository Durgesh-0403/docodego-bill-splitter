PRAGMA foreign_keys = ON;

CREATE TABLE homes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_home_name
    CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_members_home
    FOREIGN KEY (home_id)
    REFERENCES homes(id)
    ON DELETE CASCADE,

    CONSTRAINT chk_member_name
    CHECK (length(trim(name)) > 0)
);

CREATE TABLE bills (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    title TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_bills_home
    FOREIGN KEY (home_id)
    REFERENCES homes(id)
    ON DELETE CASCADE,

    CONSTRAINT chk_bill_total_positive
    CHECK (total_cents > 0),

    CONSTRAINT chk_bill_title
    CHECK (length(trim(title)) > 0)
);

CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT DEFAULT NULL,
    idempotency_key TEXT DEFAULT NULL,

    CONSTRAINT fk_shares_bill
    FOREIGN KEY (bill_id)
    REFERENCES bills(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_shares_member
    FOREIGN KEY (member_id)
    REFERENCES members(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_bill_member
    UNIQUE (bill_id, member_id),

    CONSTRAINT chk_share_amount
    CHECK (amount_cents >= 0),

    CONSTRAINT chk_payment_state
    CHECK (
        (paid_at IS NULL AND idempotency_key IS NULL)
        OR
        (paid_at IS NOT NULL AND idempotency_key IS NOT NULL)
    )
);

CREATE INDEX idx_members_home
ON members(home_id);

CREATE INDEX idx_bills_home
ON bills(home_id);

CREATE INDEX idx_shares_bill
ON shares(bill_id);

CREATE INDEX idx_shares_member
ON shares(member_id);