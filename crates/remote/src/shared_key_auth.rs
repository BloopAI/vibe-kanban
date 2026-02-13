// SharedKey authorization policy for connecting to Azurite (local Azure Storage emulator).
// Only used for local development — production uses Entra ID.
// Based on: https://github.com/Azure/azure-sdk-for-rust/issues/2975#issuecomment-3538764202

use std::borrow::Cow;
use std::sync::Arc;

use async_trait::async_trait;
use azure_core::{
    credentials::Secret,
    http::{
        headers::{HeaderName, Headers, CONTENT_LENGTH},
        policies::{Policy, PolicyResult},
        Context, Method, Request, Url,
    },
};
use base64::prelude::*;
use hmac::{Hmac, Mac};
use sha2::Sha256;

#[derive(Debug)]
pub struct SharedKeyAuthorizationPolicy {
    pub account: String,
    pub key: Secret,
}

#[async_trait]
impl Policy for SharedKeyAuthorizationPolicy {
    async fn send(
        &self,
        ctx: &Context,
        request: &mut Request,
        next: &[Arc<dyn Policy>],
    ) -> PolicyResult {
        let auth = generate_authorization(
            request.headers(),
            request.url(),
            &request.method(),
            &self.account,
            &self.key,
        );
        request.insert_header("authorization", auth);
        next[0].send(ctx, request, &next[1..]).await
    }
}

fn generate_authorization(
    h: &Headers,
    u: &Url,
    method: &Method,
    account: &str,
    key: &Secret,
) -> String {
    let str_to_sign = string_to_sign(account, h, u, method);
    let auth = hmac_sha256(&str_to_sign, key);
    format!("SharedKey {account}:{auth}")
}

fn string_to_sign(account: &str, h: &Headers, u: &Url, method: &Method) -> String {
    let content_length = h
        .get_optional_str(&CONTENT_LENGTH)
        .filter(|&v| v != "0")
        .unwrap_or_default();
    format!(
        "{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}{}",
        method.as_ref(),
        add_if_exists(h, &HeaderName::from_static("content-encoding")),
        add_if_exists(h, &HeaderName::from_static("content-language")),
        content_length,
        add_if_exists(h, &HeaderName::from_static("content-md5")),
        add_if_exists(h, &HeaderName::from_static("content-type")),
        add_if_exists(h, &HeaderName::from_static("date")),
        add_if_exists(h, &HeaderName::from_static("if-modified-since")),
        add_if_exists(h, &HeaderName::from_static("if-match")),
        add_if_exists(h, &HeaderName::from_static("if-none-match")),
        add_if_exists(h, &HeaderName::from_static("if-unmodified-since")),
        add_if_exists(h, &HeaderName::from_static("byte_range")),
        canonicalize_header(h),
        canonicalized_resource(account, u),
    )
}

#[inline]
fn add_if_exists<'a>(h: &'a Headers, key: &HeaderName) -> &'a str {
    h.get_optional_str(key).unwrap_or("")
}

fn canonicalize_header(headers: &Headers) -> String {
    let mut names: Vec<_> = headers
        .iter()
        .filter_map(|(k, _)| k.as_str().starts_with("x-ms").then_some(k))
        .collect();
    names.sort_unstable();

    let mut result = String::new();
    for header_name in names {
        let value = headers.get_optional_str(header_name).unwrap();
        let name = header_name.as_str();
        result = format!("{result}{name}:{value}\n");
    }
    result
}

fn lexy_sort<'a>(
    pairs: impl Iterator<Item = (Cow<'a, str>, Cow<'a, str>)>,
    query_param: &str,
) -> Vec<Cow<'a, str>> {
    let mut values: Vec<_> = pairs
        .filter(|(k, _)| *k == query_param)
        .map(|(_, v)| v)
        .collect();
    values.sort_unstable();
    values
}

fn canonicalized_resource(account: &str, uri: &Url) -> String {
    let mut can_res = String::new();
    can_res.push('/');
    can_res.push_str(account);

    for p in uri.path_segments().into_iter().flatten() {
        can_res.push('/');
        can_res.push_str(p);
    }
    can_res.push('\n');

    let query_pairs = uri.query_pairs();
    let mut qps = Vec::new();
    for (q, _) in query_pairs.clone() {
        if !qps.iter().any(|x: &String| x == &*q) {
            qps.push(q.into_owned());
        }
    }
    qps.sort();

    for qparam in &qps {
        let ret = lexy_sort(uri.query_pairs(), qparam);
        can_res.push_str(&qparam.to_lowercase());
        can_res.push(':');
        for (i, item) in ret.iter().enumerate() {
            if i > 0 {
                can_res.push(',');
            }
            can_res.push_str(item);
        }
        can_res.push('\n');
    }

    can_res[..can_res.len() - 1].to_owned()
}

pub fn hmac_sha256(data: &str, key: &Secret) -> String {
    let key = BASE64_STANDARD.decode(key.secret()).unwrap();
    let mut hmac = Hmac::<Sha256>::new_from_slice(&key).unwrap();
    hmac.update(data.as_bytes());
    BASE64_STANDARD.encode(hmac.finalize().into_bytes())
}
