-- Drop unused relay_sessions and relay_auth_codes tables.
-- Session creation now happens directly on the relay server via
-- relay_browser_sessions, making these tables obsolete.

DROP TABLE IF EXISTS relay_auth_codes;
DROP TABLE IF EXISTS relay_sessions;
