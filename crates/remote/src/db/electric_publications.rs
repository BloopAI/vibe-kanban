use std::collections::HashSet;

use sqlx::PgPool;

#[derive(Debug)]
struct PublicationTable {
    schema_name: String,
    table_name: String,
}

#[derive(Debug, Hash, PartialEq, Eq)]
struct PublicationTableRef {
    pubname: String,
    schema_name: String,
    table_name: String,
}

pub(crate) async fn ensure_electric_publications(
    pool: &PgPool,
    publication_names: &[String],
) -> Result<(), sqlx::Error> {
    if publication_names.is_empty() {
        return Ok(());
    }

    tracing::info!(
        publication_count = publication_names.len(),
        publications = ?publication_names,
        "Electric publication sync starting"
    );

    let mut tx = pool.begin().await?;

    sqlx::query(r#"SELECT pg_advisory_xact_lock(hashtext('electric_publication_sync'))"#)
        .execute(&mut *tx)
        .await?;

    let existing_publications = sqlx::query_scalar!(
        r#"SELECT pubname FROM pg_publication WHERE pubname = ANY($1)"#,
        publication_names
    )
    .fetch_all(&mut *tx)
    .await?;
    let existing_publications: HashSet<String> = existing_publications.into_iter().collect();

    let mut created_publications = Vec::new();
    let mut skipped_publications = Vec::new();

    for publication in publication_names {
        if !existing_publications.contains(publication) {
            let sql = format!("CREATE PUBLICATION {}", quote_ident(publication));
            sqlx::query(&sql).execute(&mut *tx).await?;
            created_publications.push(publication.clone());
        } else {
            skipped_publications.push(publication.clone());
        }
    }

    if !created_publications.is_empty() {
        tracing::info!(publications = ?created_publications, "Created missing Electric publications");
    }
    if !skipped_publications.is_empty() {
        tracing::info!(publications = ?skipped_publications, "Electric publications already exist (skipped)");
    }

    let tables = sqlx::query_as!(
        PublicationTable,
        r#"SELECT n.nspname AS schema_name, c.relname AS table_name
           FROM pg_publication_rel pr
           JOIN pg_publication p ON pr.prpubid = p.oid
           JOIN pg_class c ON pr.prrelid = c.oid
           JOIN pg_namespace n ON c.relnamespace = n.oid
           WHERE p.pubname = 'electric_publication_default'"#
    )
    .fetch_all(&mut *tx)
    .await?;

    tracing::info!(
        default_table_count = tables.len(),
        "Loaded tables from electric_publication_default"
    );

    let existing_pairs = sqlx::query_as!(
        PublicationTableRef,
        r#"SELECT p.pubname AS pubname, n.nspname AS schema_name, c.relname AS table_name
           FROM pg_publication_rel pr
           JOIN pg_publication p ON pr.prpubid = p.oid
           JOIN pg_class c ON pr.prrelid = c.oid
           JOIN pg_namespace n ON c.relnamespace = n.oid
           WHERE p.pubname = ANY($1)"#,
        publication_names
    )
    .fetch_all(&mut *tx)
    .await?;
    let existing_pairs: HashSet<PublicationTableRef> = existing_pairs.into_iter().collect();

    let mut missing_pairs = Vec::new();
    for table in &tables {
        for publication in publication_names {
            let key = PublicationTableRef {
                pubname: publication.clone(),
                schema_name: table.schema_name.clone(),
                table_name: table.table_name.clone(),
            };
            if !existing_pairs.contains(&key) {
                missing_pairs.push(key);
            }
        }
    }

    tracing::info!(
        missing_pair_count = missing_pairs.len(),
        "Computed missing publication/table mappings"
    );

    for entry in &missing_pairs {
        let sql = format!(
            "ALTER PUBLICATION {} ADD TABLE {}.{}",
            quote_ident(&entry.pubname),
            quote_ident(&entry.schema_name),
            quote_ident(&entry.table_name)
        );
        sqlx::query(&sql).execute(&mut *tx).await?;
    }

    if !missing_pairs.is_empty() {
        tracing::info!(
            added_pair_count = missing_pairs.len(),
            "Added missing tables to Electric publications"
        );
    } else {
        tracing::info!("No missing tables to add to Electric publications");
    }

    tx.commit().await?;

    tracing::info!("Electric publication sync completed");

    Ok(())
}

fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('\"', "\"\""))
}
