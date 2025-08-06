#[cfg(test)]
mod tests {
    use uuid::Uuid;
    use crate::auth::{generate_jwt_token, validate_jwt_token, is_user_whitelisted};

    #[test]
    fn test_jwt_generation_and_validation() {
        let user_id = Uuid::new_v4();
        let github_id = 12345;
        let username = "testuser";
        let email = "test@example.com";

        // Generate a JWT token
        let token = generate_jwt_token(user_id, github_id, username, email)
            .expect("Failed to generate JWT token");

        // Validate the token
        let claims = validate_jwt_token(&token)
            .expect("Failed to validate JWT token");

        // Verify the claims
        assert_eq!(claims.sub, user_id.to_string());
        assert_eq!(claims.github_id, github_id);
        assert_eq!(claims.username, username);
        assert_eq!(claims.email, email);
    }

    #[test]
    fn test_invalid_jwt_token() {
        let invalid_token = "invalid.jwt.token";
        let result = validate_jwt_token(invalid_token);
        assert!(result.is_err());
    }

    #[test]
    fn test_whitelist_functionality() {
        // Test with no whitelist (should allow all)
        std::env::remove_var("GITHUB_USER_WHITELIST");
        assert!(is_user_whitelisted("anyuser"));

        // Test with empty whitelist (should allow all)
        std::env::set_var("GITHUB_USER_WHITELIST", "");
        assert!(is_user_whitelisted("anyuser"));

        // Test with whitelist
        std::env::set_var("GITHUB_USER_WHITELIST", "user1,user2,user3");
        assert!(is_user_whitelisted("user1"));
        assert!(is_user_whitelisted("USER2")); // Case insensitive
        assert!(!is_user_whitelisted("user4"));
    }
}