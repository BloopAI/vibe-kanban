use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use rand::Rng;
use spake2::{Ed25519Group, Identity, Password, Spake2, SysRng, UnwrapErr};

use crate::error::TrustedKeyAuthError;

const SPAKE2_CLIENT_ID: &[u8] = b"vibe-kanban-browser";
const SPAKE2_SERVER_ID: &[u8] = b"vibe-kanban-server";
pub const ENROLLMENT_CODE_LENGTH: usize = 6;
const ENROLLMENT_CODE_CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

#[derive(Debug)]
pub struct Spake2StartOutcome {
    pub enrollment_code: String,
    pub shared_key: Vec<u8>,
    pub server_message_b64: String,
}

pub fn start_spake2_enrollment(
    raw_enrollment_code: &str,
    client_message_b64: &str,
) -> Result<Spake2StartOutcome, TrustedKeyAuthError> {
    let enrollment_code = normalize_enrollment_code(raw_enrollment_code)?;
    let client_message = decode_base64(client_message_b64)
        .map_err(|_| TrustedKeyAuthError::BadRequest("Invalid client_message_b64".to_string()))?;

    let password = Password::new(enrollment_code.as_bytes());
    let id_a = Identity::new(SPAKE2_CLIENT_ID);
    let id_b = Identity::new(SPAKE2_SERVER_ID);
    let (server_state, server_message) =
        Spake2::<Ed25519Group>::start_b_with_rng(&password, &id_a, &id_b, UnwrapErr(SysRng));

    let shared_key = server_state
        .finish(&client_message)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;

    Ok(Spake2StartOutcome {
        enrollment_code,
        shared_key,
        server_message_b64: BASE64_STANDARD.encode(server_message),
    })
}

pub fn generate_one_time_code() -> String {
    let mut rng = rand::thread_rng();
    let mut code = String::with_capacity(ENROLLMENT_CODE_LENGTH);
    for _ in 0..ENROLLMENT_CODE_LENGTH {
        let idx = rng.gen_range(0..ENROLLMENT_CODE_CHARSET.len());
        code.push(ENROLLMENT_CODE_CHARSET[idx] as char);
    }
    code
}

pub fn normalize_enrollment_code(raw_code: &str) -> Result<String, TrustedKeyAuthError> {
    let code = raw_code.trim().to_ascii_uppercase();
    if code.len() != ENROLLMENT_CODE_LENGTH {
        return Err(TrustedKeyAuthError::BadRequest(format!(
            "Invalid enrollment code length. Expected {ENROLLMENT_CODE_LENGTH} characters."
        )));
    }

    if !code
        .bytes()
        .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
    {
        return Err(TrustedKeyAuthError::BadRequest(
            "Enrollment code must contain only A-Z and 0-9.".to_string(),
        ));
    }

    Ok(code)
}

fn decode_base64(input: &str) -> Result<Vec<u8>, TrustedKeyAuthError> {
    BASE64_STANDARD
        .decode(input)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_enrollment_code_accepts_valid_input() {
        let normalized = normalize_enrollment_code("ab12z9").unwrap();
        assert_eq!(normalized, "AB12Z9");
    }

    #[test]
    fn normalize_enrollment_code_rejects_invalid_characters() {
        assert!(normalize_enrollment_code("AB!2Z9").is_err());
    }

    #[test]
    fn generate_one_time_code_uses_expected_charset_and_length() {
        let code = generate_one_time_code();
        assert_eq!(code.len(), ENROLLMENT_CODE_LENGTH);
        assert!(
            code.bytes()
                .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
        );
    }
}
