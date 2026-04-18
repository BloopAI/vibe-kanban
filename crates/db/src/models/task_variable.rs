use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

/// Names of system-provided variables that are automatically available
pub const SYSTEM_VARIABLE_NAMES: &[&str] = &[
    "TASK_ID",
    "PARENT_TASK_ID",
    "TASK_TITLE",
    "TASK_DESCRIPTION",
    "TASK_LABEL",
    "PROJECT_ID",
    "PROJECT_TITLE",
    "IS_SUBTASK",
];

/// Generate the set of runtime system variables for a task.
///
/// The returned variables represent system-provided values (e.g., TASK_ID, PARENT_TASK_ID,
/// TASK_TITLE, TASK_DESCRIPTION, TASK_LABEL, PROJECT_ID, PROJECT_TITLE, IS_SUBTASK) computed
/// from the task, its project, and its labels. These variables are not persisted in the database.
///
/// # Returns
///
/// A vector of `ResolvedVariable` entries for the task's system variables; each entry's
/// `source_task_id` is the provided `task_id` and `inherited` is always `false`.
///
/// # Examples
///
/// ```ignore
/// // `pool` and `task_id` must refer to an existing task in the test database.
/// let vars = get_system_variables(&pool, task_id).await.unwrap();
/// assert!(vars.iter().any(|v| v.name == "TASK_ID"));
/// ```
pub async fn get_system_variables(
    pool: &SqlitePool,
    task_id: Uuid,
) -> Result<Vec<ResolvedVariable>, sqlx::Error> {
    use crate::models::label::Label;
    use crate::models::project::Project;
    use crate::models::task::Task;

    let task = Task::find_by_id(pool, task_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;

    let project = Project::find_by_id(pool, task.project_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;

    let labels = Label::find_by_task_id(pool, task_id).await?;
    let label_name = labels.first().map(|l| l.name.clone()).unwrap_or_default();

    Ok(vec![
        ResolvedVariable {
            name: "TASK_ID".to_string(),
            value: task.id.to_string(),
            source_task_id: task_id,
            inherited: false,
        },
        ResolvedVariable {
            name: "PARENT_TASK_ID".to_string(),
            value: task
                .parent_task_id
                .map(|id| id.to_string())
                .unwrap_or_default(),
            source_task_id: task_id,
            inherited: false,
        },
        ResolvedVariable {
            name: "TASK_TITLE".to_string(),
            value: task.title.clone(),
            source_task_id: task_id,
            inherited: false,
        },
        ResolvedVariable {
            name: "TASK_DESCRIPTION".to_string(),
            value: task.description.clone().unwrap_or_default(),
            source_task_id: task_id,
            inherited: false,
        },
        ResolvedVariable {
            name: "TASK_LABEL".to_string(),
            value: label_name,
            source_task_id: task_id,
            inherited: false,
        },
        ResolvedVariable {
            name: "PROJECT_ID".to_string(),
            value: project.id.to_string(),
            source_task_id: task_id,
            inherited: false,
        },
        ResolvedVariable {
            name: "PROJECT_TITLE".to_string(),
            value: project.name.clone(),
            source_task_id: task_id,
            inherited: false,
        },
        ResolvedVariable {
            name: "IS_SUBTASK".to_string(),
            value: if task.parent_task_id.is_some() {
                "true"
            } else {
                "false"
            }
            .to_string(),
            source_task_id: task_id,
            inherited: false,
        },
    ])
}

/// A variable defined on a task, used for $VAR expansion in task descriptions
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskVariable {
    pub id: Uuid,
    pub task_id: Uuid,
    pub name: String,
    pub value: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Request to create a new task variable
#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskVariable {
    pub name: String,
    pub value: String,
}

/// Request to update an existing task variable
#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskVariable {
    pub name: Option<String>,
    pub value: Option<String>,
}

/// A resolved variable with source information for inheritance display
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ResolvedVariable {
    pub name: String,
    pub value: String,
    /// The task ID this variable was defined on (may differ from requested task_id for inherited vars)
    pub source_task_id: Uuid,
    /// True if this variable was inherited from a parent task
    pub inherited: bool,
}

impl TaskVariable {
    /// Find all variables defined directly on a task (not inherited)
    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskVariable,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                name,
                value,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_variables
               WHERE task_id = $1
               ORDER BY name ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find a variable by its ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskVariable,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                name,
                value,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_variables
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new variable on a task
    pub async fn create(
        pool: &SqlitePool,
        task_id: Uuid,
        data: &CreateTaskVariable,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            TaskVariable,
            r#"INSERT INTO task_variables (id, task_id, name, value)
               VALUES ($1, $2, $3, $4)
               RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                name,
                value,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            task_id,
            data.name,
            data.value
        )
        .fetch_one(pool)
        .await
    }

    /// Update an existing variable
    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTaskVariable,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.as_ref().unwrap_or(&existing.name);
        let value = data.value.as_ref().unwrap_or(&existing.value);

        sqlx::query_as!(
            TaskVariable,
            r#"UPDATE task_variables
               SET name = $2, value = $3, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                name,
                value,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            value
        )
        .fetch_one(pool)
        .await
    }

    /// Delete a variable
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM task_variables WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Find all variables for a task including inherited ones from parent chain.
    /// Child variables override parent variables with the same name.
    /// Returns variables as a list with source information.
    ///
    /// Performance: Uses a recursive CTE to traverse the parent chain and fetch
    /// all variables in a single query, reducing from O(2*depth) queries to O(1).
    pub async fn find_inherited(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<ResolvedVariable>, sqlx::Error> {
        // Use recursive CTE to traverse parent chain and collect variables in one query.
        // The CTE builds the task chain with depth, then joins variables.
        // We use ROW_NUMBER partitioned by name and ordered by depth ASC to get
        // the closest (child) variable for each name, allowing child overrides.
        let rows = sqlx::query!(
            r#"
            WITH RECURSIVE task_chain AS (
                -- Base case: start with the requested task at depth 0
                SELECT id, parent_task_id, CAST(0 AS INTEGER) as depth
                FROM tasks
                WHERE id = $1

                UNION ALL

                -- Recursive case: traverse to parent, incrementing depth
                SELECT t.id, t.parent_task_id, CAST(tc.depth + 1 AS INTEGER)
                FROM tasks t
                INNER JOIN task_chain tc ON t.id = tc.parent_task_id
            ),
            -- Join variables with task chain and rank by depth per variable name
            ranked_vars AS (
                SELECT
                    tv.name,
                    tv.value,
                    tc.id as source_task_id,
                    tc.depth,
                    ROW_NUMBER() OVER (PARTITION BY tv.name ORDER BY tc.depth ASC) as rn
                FROM task_chain tc
                INNER JOIN task_variables tv ON tv.task_id = tc.id
            )
            -- Select only the closest (lowest depth) variable for each name
            SELECT
                name as "name!",
                value as "value!",
                source_task_id as "source_task_id!: Uuid",
                depth as "depth!: i32"
            FROM ranked_vars
            WHERE rn = 1
            ORDER BY name ASC
            "#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        // Convert to ResolvedVariable, marking inherited based on depth
        let result = rows
            .into_iter()
            .map(|row| ResolvedVariable {
                name: row.name,
                value: row.value,
                source_task_id: row.source_task_id,
                inherited: row.depth > 0,
            })
            .collect();

        Ok(result)
    }

    /// Produce a mapping of resolved variable names to their corresponding value and originating task ID.
    ///
    /// Returns a `HashMap` where each key is a variable name and each value is a tuple `(value, source_task_id)`.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use sqlx::SqlitePool;
    /// # use uuid::Uuid;
    /// # use crates::db::models::task_variable::TaskVariable;
    /// # async fn example(pool: &SqlitePool, task_id: Uuid) {
    /// let map = TaskVariable::get_variable_map(pool, task_id).await.unwrap();
    /// if let Some((value, source)) = map.get("TASK_TITLE") {
    ///     println!("TASK_TITLE = {} (from {})", value, source);
    /// }
    /// # }
    /// ```
    pub async fn get_variable_map(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<std::collections::HashMap<String, (String, Uuid)>, sqlx::Error> {
        let resolved = Self::find_inherited(pool, task_id).await?;
        Ok(resolved
            .into_iter()
            .map(|rv| (rv.name, (rv.value, rv.source_task_id)))
            .collect())
    }

    /// Collects resolved variables for a task, combining inherited user variables with runtime system variables.
    ///
    /// System-provided variables will replace any user-defined variables that share the same name. The returned
    /// vector is sorted by variable name.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use uuid::Uuid;
    /// // within an async context
    /// let vars = TaskVariable::find_inherited_with_system(&pool, task_id).await?;
    /// for v in vars {
    ///     println!("{} = {}", v.name, v.value);
    /// }
    /// ```
    pub async fn find_inherited_with_system(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<ResolvedVariable>, sqlx::Error> {
        let user_vars = Self::find_inherited(pool, task_id).await?;
        let system_vars = get_system_variables(pool, task_id).await?;

        let system_names: std::collections::HashSet<&str> =
            system_vars.iter().map(|v| v.name.as_str()).collect();

        let mut result: Vec<ResolvedVariable> = user_vars
            .into_iter()
            .filter(|v| !system_names.contains(v.name.as_str()))
            .collect();

        result.extend(system_vars);
        result.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(result)
    }

    /// Return a map of resolved variables for a task, including system variables.
    ///
    /// The returned map maps variable name -> (value, source_task_id). System variables override
    /// user-defined variables with the same name.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use sqlx::SqlitePool; use uuid::Uuid;
    /// # async fn run() -> Result<(), Box<dyn std::error::Error>> {
    /// let pool = SqlitePool::connect("sqlite::memory:").await?;
    /// let task_id = Uuid::new_v4();
    /// let vars = crate::models::task_variable::get_variable_map_with_system(&pool, task_id).await?;
    /// // `vars` is a HashMap<String, (String, Uuid)> where keys are variable names.
    /// # Ok(()) }
    /// ```
    pub async fn get_variable_map_with_system(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<std::collections::HashMap<String, (String, Uuid)>, sqlx::Error> {
        let resolved = Self::find_inherited_with_system(pool, task_id).await?;
        Ok(resolved
            .into_iter()
            .map(|rv| (rv.name, (rv.value, rv.source_task_id)))
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::label::{CreateLabel, Label};
    use crate::models::project::{CreateProject, Project};
    use crate::models::task::{CreateTask, Task, TaskStatus};
    use crate::test_utils::create_test_pool;

    /// Helper to create a test project
    async fn create_test_project(pool: &SqlitePool, name: &str) -> Project {
        let create_data = CreateProject {
            name: name.to_string(),
            git_repo_path: format!("/tmp/test-repo-{}", name),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        let project_id = Uuid::new_v4();
        Project::create(pool, &create_data, project_id)
            .await
            .expect("Failed to create test project")
    }

    /// Helper to create a test task
    async fn create_test_task(
        pool: &SqlitePool,
        project_id: Uuid,
        title: &str,
        description: Option<String>,
        parent_task_id: Option<Uuid>,
    ) -> Task {
        let create_data = CreateTask {
            project_id,
            title: title.to_string(),
            description,
            status: Some(TaskStatus::Todo),
            parent_task_id,
            image_ids: None,
            shared_task_id: None,
        };
        let task_id = Uuid::new_v4();
        Task::create(pool, &create_data, task_id)
            .await
            .expect("Failed to create test task")
    }

    /// Helper to create a test label
    async fn create_test_label(pool: &SqlitePool, name: &str, color: &str) -> Label {
        let create_data = CreateLabel {
            project_id: None, // Global label
            name: name.to_string(),
            icon: "tag".to_string(),
            color: color.to_string(),
        };
        Label::create(pool, &create_data)
            .await
            .expect("Failed to create test label")
    }

    #[tokio::test]
    async fn test_get_system_variables() {
        let (pool, _temp_dir) = create_test_pool().await;

        // Create a project
        let project = create_test_project(&pool, "Test Project").await;

        // Create a parent task
        let parent_task = create_test_task(
            &pool,
            project.id,
            "Parent Task",
            Some("Parent description".to_string()),
            None,
        )
        .await;

        // Create a child task
        let child_task = create_test_task(
            &pool,
            project.id,
            "Child Task",
            Some("Child description".to_string()),
            Some(parent_task.id),
        )
        .await;

        // Create a label and assign it to the child task
        let label = create_test_label(&pool, "bug", "#ff0000").await;
        Label::set_task_labels(&pool, child_task.id, &[label.id])
            .await
            .expect("Failed to set task labels");

        // Get system variables for the child task
        let system_vars = get_system_variables(&pool, child_task.id)
            .await
            .expect("Failed to get system variables");

        // Verify all system variables are present
        assert_eq!(system_vars.len(), SYSTEM_VARIABLE_NAMES.len());

        // Build a map for easier verification
        let var_map: std::collections::HashMap<String, ResolvedVariable> = system_vars
            .into_iter()
            .map(|v| (v.name.clone(), v))
            .collect();

        // Verify TASK_ID
        assert_eq!(var_map["TASK_ID"].value, child_task.id.to_string());
        assert_eq!(var_map["TASK_ID"].source_task_id, child_task.id);
        assert!(!var_map["TASK_ID"].inherited);

        // Verify PARENT_TASK_ID
        assert_eq!(var_map["PARENT_TASK_ID"].value, parent_task.id.to_string());
        assert_eq!(var_map["PARENT_TASK_ID"].source_task_id, child_task.id);

        // Verify TASK_TITLE
        assert_eq!(var_map["TASK_TITLE"].value, "Child Task");

        // Verify TASK_DESCRIPTION
        assert_eq!(var_map["TASK_DESCRIPTION"].value, "Child description");

        // Verify TASK_LABEL
        assert_eq!(var_map["TASK_LABEL"].value, "bug");

        // Verify PROJECT_ID
        assert_eq!(var_map["PROJECT_ID"].value, project.id.to_string());

        // Verify PROJECT_TITLE
        assert_eq!(var_map["PROJECT_TITLE"].value, "Test Project");

        // Verify IS_SUBTASK
        assert_eq!(var_map["IS_SUBTASK"].value, "true");
    }

    #[tokio::test]
    async fn test_get_system_variables_no_parent() {
        let (pool, _temp_dir) = create_test_pool().await;

        // Create a project and task without parent
        let project = create_test_project(&pool, "Test Project").await;
        let task = create_test_task(&pool, project.id, "Standalone Task", None, None).await;

        let system_vars = get_system_variables(&pool, task.id)
            .await
            .expect("Failed to get system variables");

        let var_map: std::collections::HashMap<String, ResolvedVariable> = system_vars
            .into_iter()
            .map(|v| (v.name.clone(), v))
            .collect();

        // Verify PARENT_TASK_ID is empty
        assert_eq!(var_map["PARENT_TASK_ID"].value, "");

        // Verify IS_SUBTASK is false
        assert_eq!(var_map["IS_SUBTASK"].value, "false");
    }

    #[tokio::test]
    async fn test_find_inherited_with_system_overrides_user_variables() {
        let (pool, _temp_dir) = create_test_pool().await;

        // Create a project and task
        let project = create_test_project(&pool, "Test Project").await;
        let task = create_test_task(&pool, project.id, "Test Task", None, None).await;

        // Create user variables with names that conflict with system variables
        let create_data = CreateTaskVariable {
            name: "TASK_ID".to_string(),
            value: "user-defined-task-id".to_string(),
        };
        TaskVariable::create(&pool, task.id, &create_data)
            .await
            .expect("Failed to create user variable");

        let create_data = CreateTaskVariable {
            name: "PROJECT_TITLE".to_string(),
            value: "User Project Title".to_string(),
        };
        TaskVariable::create(&pool, task.id, &create_data)
            .await
            .expect("Failed to create user variable");

        // Create a non-conflicting user variable
        let create_data = CreateTaskVariable {
            name: "CUSTOM_VAR".to_string(),
            value: "custom-value".to_string(),
        };
        TaskVariable::create(&pool, task.id, &create_data)
            .await
            .expect("Failed to create user variable");

        // Get variables with system overrides
        let resolved = TaskVariable::find_inherited_with_system(&pool, task.id)
            .await
            .expect("Failed to get variables");

        let var_map: std::collections::HashMap<String, ResolvedVariable> =
            resolved.into_iter().map(|v| (v.name.clone(), v)).collect();

        // Verify system variables override user variables
        assert_eq!(var_map["TASK_ID"].value, task.id.to_string());
        assert_ne!(var_map["TASK_ID"].value, "user-defined-task-id");

        assert_eq!(var_map["PROJECT_TITLE"].value, "Test Project");
        assert_ne!(var_map["PROJECT_TITLE"].value, "User Project Title");

        // Verify non-conflicting user variable is preserved
        assert!(var_map.contains_key("CUSTOM_VAR"));
        assert_eq!(var_map["CUSTOM_VAR"].value, "custom-value");
        assert_eq!(var_map["CUSTOM_VAR"].source_task_id, task.id);
    }

    #[tokio::test]
    async fn test_find_inherited_with_system_includes_inherited_variables() {
        let (pool, _temp_dir) = create_test_pool().await;

        // Create a project
        let project = create_test_project(&pool, "Test Project").await;

        // Create parent task with variables
        let parent_task = create_test_task(&pool, project.id, "Parent Task", None, None).await;
        let create_data = CreateTaskVariable {
            name: "PARENT_VAR".to_string(),
            value: "from-parent".to_string(),
        };
        TaskVariable::create(&pool, parent_task.id, &create_data)
            .await
            .expect("Failed to create parent variable");

        // Create child task with its own variable and one that overrides parent
        let child_task =
            create_test_task(&pool, project.id, "Child Task", None, Some(parent_task.id)).await;
        let create_data = CreateTaskVariable {
            name: "CHILD_VAR".to_string(),
            value: "from-child".to_string(),
        };
        TaskVariable::create(&pool, child_task.id, &create_data)
            .await
            .expect("Failed to create child variable");

        let create_data = CreateTaskVariable {
            name: "PARENT_VAR".to_string(),
            value: "overridden-by-child".to_string(),
        };
        TaskVariable::create(&pool, child_task.id, &create_data)
            .await
            .expect("Failed to create overriding child variable");

        // Get variables for child task
        let resolved = TaskVariable::find_inherited_with_system(&pool, child_task.id)
            .await
            .expect("Failed to get variables");

        let var_map: std::collections::HashMap<String, ResolvedVariable> =
            resolved.into_iter().map(|v| (v.name.clone(), v)).collect();

        // Verify child variable is present
        assert_eq!(var_map["CHILD_VAR"].value, "from-child");
        assert_eq!(var_map["CHILD_VAR"].source_task_id, child_task.id);
        assert!(!var_map["CHILD_VAR"].inherited);

        // Verify parent variable is overridden by child
        assert_eq!(var_map["PARENT_VAR"].value, "overridden-by-child");
        assert_eq!(var_map["PARENT_VAR"].source_task_id, child_task.id);
        assert!(!var_map["PARENT_VAR"].inherited);

        // Verify system variables are present
        assert!(var_map.contains_key("TASK_ID"));
        assert!(var_map.contains_key("PROJECT_ID"));
        assert_eq!(var_map["IS_SUBTASK"].value, "true");
    }

    #[tokio::test]
    async fn test_get_variable_map_with_system_returns_correct_format() {
        let (pool, _temp_dir) = create_test_pool().await;

        // Create a project and task
        let project = create_test_project(&pool, "Test Project").await;
        let task = create_test_task(
            &pool,
            project.id,
            "Test Task",
            Some("Test description".to_string()),
            None,
        )
        .await;

        // Create a user variable
        let create_data = CreateTaskVariable {
            name: "MY_VAR".to_string(),
            value: "my-value".to_string(),
        };
        TaskVariable::create(&pool, task.id, &create_data)
            .await
            .expect("Failed to create user variable");

        // Get variable map
        let var_map = TaskVariable::get_variable_map_with_system(&pool, task.id)
            .await
            .expect("Failed to get variable map");

        // Verify HashMap structure: name -> (value, source_task_id)
        assert!(var_map.contains_key("MY_VAR"));
        let (value, source_task_id) = &var_map["MY_VAR"];
        assert_eq!(value, "my-value");
        assert_eq!(*source_task_id, task.id);

        // Verify system variables are in the map
        assert!(var_map.contains_key("TASK_ID"));
        let (task_id_value, task_id_source) = &var_map["TASK_ID"];
        assert_eq!(*task_id_value, task.id.to_string());
        assert_eq!(*task_id_source, task.id);

        assert!(var_map.contains_key("PROJECT_TITLE"));
        let (project_title_value, _) = &var_map["PROJECT_TITLE"];
        assert_eq!(*project_title_value, "Test Project");

        // Verify all system variables are present
        for system_var_name in SYSTEM_VARIABLE_NAMES {
            assert!(
                var_map.contains_key(*system_var_name),
                "System variable {} should be in map",
                system_var_name
            );
        }
    }

    #[tokio::test]
    async fn test_inherited_variables_marked_correctly() {
        let (pool, _temp_dir) = create_test_pool().await;

        // Create project and parent task
        let project = create_test_project(&pool, "Test Project").await;
        let parent_task = create_test_task(&pool, project.id, "Parent Task", None, None).await;

        // Add variable to parent
        let create_data = CreateTaskVariable {
            name: "INHERITED_VAR".to_string(),
            value: "from-parent".to_string(),
        };
        TaskVariable::create(&pool, parent_task.id, &create_data)
            .await
            .expect("Failed to create parent variable");

        // Create child task
        let child_task =
            create_test_task(&pool, project.id, "Child Task", None, Some(parent_task.id)).await;

        // Get inherited variables (without system)
        let resolved = TaskVariable::find_inherited(&pool, child_task.id)
            .await
            .expect("Failed to get inherited variables");

        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].name, "INHERITED_VAR");
        assert_eq!(resolved[0].value, "from-parent");
        assert_eq!(resolved[0].source_task_id, parent_task.id);
        assert!(resolved[0].inherited); // Should be marked as inherited

        // Now get variables with system
        let resolved_with_system = TaskVariable::find_inherited_with_system(&pool, child_task.id)
            .await
            .expect("Failed to get variables with system");

        let var_map: std::collections::HashMap<String, ResolvedVariable> = resolved_with_system
            .into_iter()
            .map(|v| (v.name.clone(), v))
            .collect();

        // Verify inherited variable is still marked correctly
        assert!(var_map["INHERITED_VAR"].inherited);
        assert_eq!(var_map["INHERITED_VAR"].source_task_id, parent_task.id);

        // Verify system variables are NOT marked as inherited (they come from the current task)
        assert!(!var_map["TASK_ID"].inherited);
        assert_eq!(var_map["TASK_ID"].source_task_id, child_task.id);
    }
}
