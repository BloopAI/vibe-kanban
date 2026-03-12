CREATE TABLE notification_digest_deliveries (
    notification_id UUID PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_digest_deliveries_user_id
    ON notification_digest_deliveries (user_id, sent_at DESC);
