-- Organization billing records for Stripe subscriptions
CREATE TABLE organization_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

    -- Stripe identifiers
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    stripe_subscription_item_id TEXT,

    -- Subscription status: 'active', 'past_due', 'canceled', 'incomplete', etc.
    subscription_status TEXT,

    -- Billing period
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,

    -- Number of seats in subscription
    quantity INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for looking up by Stripe customer
CREATE INDEX idx_org_billing_stripe_customer ON organization_billing(stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

-- Index for looking up by Stripe subscription
CREATE INDEX idx_org_billing_stripe_subscription ON organization_billing(stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

-- Trigger to update updated_at on modification
CREATE TRIGGER trg_organization_billing_updated_at
    BEFORE UPDATE ON organization_billing
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
