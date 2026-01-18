use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use regex::Regex;
use syn::{Ident, LitStr, Token, Type, parse::Parse, parse_macro_input};

struct ShapeInput {
    name: Ident,
    table: LitStr,
    where_clause: LitStr,
    url: LitStr,
    row_type: Type,
}

impl Parse for ShapeInput {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        let name: Ident = input.parse()?;
        input.parse::<Token![,]>()?;
        let table: LitStr = input.parse()?;
        input.parse::<Token![,]>()?;
        let where_clause: LitStr = input.parse()?;
        input.parse::<Token![,]>()?;
        let url: LitStr = input.parse()?;
        input.parse::<Token![,]>()?;
        let row_type: Type = input.parse()?;
        Ok(ShapeInput {
            name,
            table,
            where_clause,
            url,
            row_type,
        })
    }
}

fn extract_params(where_clause: &str) -> Vec<String> {
    let re = Regex::new(r#""([a-z_][a-z0-9_]*)"\s*=\s*\$(\d+)"#).unwrap();
    let mut params: Vec<(usize, String)> = re
        .captures_iter(where_clause)
        .map(|cap| {
            let param_num: usize = cap[2].parse().unwrap();
            (param_num, cap[1].to_string())
        })
        .collect();
    params.sort_by_key(|(num, _)| *num);
    params.into_iter().map(|(_, name)| name).collect()
}

#[proc_macro]
pub fn define_shape(input: TokenStream) -> TokenStream {
    let ShapeInput {
        name,
        table,
        where_clause,
        url,
        row_type,
    } = parse_macro_input!(input as ShapeInput);

    let params = extract_params(&where_clause.value());
    let params_tokens: Vec<TokenStream2> = params.iter().map(|p| quote! { #p }).collect();

    quote! {
        pub const #name: crate::validated_where::ShapeDefinition<#row_type> =
            crate::validated_where::ShapeDefinition::new(
                #table,
                #where_clause,
                &[#(#params_tokens),*],
                #url,
            );
    }
    .into()
}
