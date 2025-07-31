// use db::models::{
//     task::{Task, TaskStatus},
//     task_attempt::TaskAttempt,
// };
// use deployment::Deployment;
// use git2::Repository;
// use services::services::{notification, worktree_manager::WorktreeManager};
// use uuid::Uuid;

// use crate::DeploymentImpl;

// /// Delegation context structure
// #[derive(Debug, serde::Deserialize)]
// struct DelegationContext {
//     delegate_to: String,
//     operation_params: DelegationOperationParams,
// }

// #[derive(Debug, serde::Deserialize)]
// struct DelegationOperationParams {
//     task_id: uuid::Uuid,
//     project_id: uuid::Uuid,
//     attempt_id: uuid::Uuid,
//     additional: Option<serde_json::Value>,
// }

// /// Parse delegation context from process args JSON
// fn parse_delegation_context(args_json: &str) -> Option<DelegationContext> {
//     // Parse the args JSON array
//     if let Ok(args_array) = serde_json::from_str::<serde_json::Value>(args_json) {
//         if let Some(args) = args_array.as_array() {
//             // Look for --delegation-context flag
//             for (i, arg) in args.iter().enumerate() {
//                 if let Some(arg_str) = arg.as_str() {
//                     if arg_str == "--delegation-context" && i + 1 < args.len() {
//                         // Next argument should be the delegation context JSON
//                         if let Some(context_str) = args[i + 1].as_str() {
//                             if let Ok(context) =
//                                 serde_json::from_str::<DelegationContext>(context_str)
//                             {
//                                 return Some(context);
//                             }
//                         }
//                     }
//                 }
//             }
//         }
//     }
//     None
// }

// /// Handle delegation after setup completion
// async fn handle_setup_delegation(app_state: &AppState, delegation_context: DelegationContext) {
//     let params = &delegation_context.operation_params;
//     let task_id = params.task_id;
//     let project_id = params.project_id;
//     let attempt_id = params.attempt_id;

//     tracing::info!(
//         "Delegating to {} after setup completion for attempt {}",
//         delegation_context.delegate_to,
//         attempt_id
//     );

//     let result = match delegation_context.delegate_to.as_str() {
//         "dev_server" => {
//             ProcessService::start_dev_server_direct(
//                 &app_state.db_pool,
//                 app_state,
//                 attempt_id,
//                 task_id,
//                 project_id,
//             )
//             .await
//         }
//         "coding_agent" => {
//             ProcessService::start_coding_agent(
//                 &app_state.db_pool,
//                 app_state,
//                 attempt_id,
//                 task_id,
//                 project_id,
//             )
//             .await
//         }
//         "followup" => {
//             let prompt = params
//                 .additional
//                 .as_ref()
//                 .and_then(|a| a.get("prompt"))
//                 .and_then(|p| p.as_str())
//                 .unwrap_or("");

//             ProcessService::start_followup_execution_direct(
//                 &app_state.db_pool,
//                 app_state,
//                 attempt_id,
//                 task_id,
//                 project_id,
//                 prompt,
//             )
//             .await
//             .map(|_| ())
//         }
//         _ => {
//             tracing::error!(
//                 "Unknown delegation target: {}",
//                 delegation_context.delegate_to
//             );
//             return;
//         }
//     };

//     if let Err(e) = result {
//         tracing::error!(
//             "Failed to delegate to {} after setup completion: {}",
//             delegation_context.delegate_to,
//             e
//         );
//     } else {
//         tracing::info!(
//             "Successfully delegated to {} after setup completion",
//             delegation_context.delegate_to
//         );
//     }
// }

/// Commit any unstaged changes in the worktree after execution completion
// async fn commit_execution_changes(
//     worktree_path: &str,
//     attempt_id: Uuid,
//     summary: Option<&str>,
// ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
//     // Run git operations in a blocking task since git2 is synchronous
//     let worktree_path = worktree_path.to_string();
//     let summary = summary.map(|s| s.to_string());
//     tokio::task::spawn_blocking(move || {
//         let worktree_repo = Repository::open(&worktree_path)?;

//         // Check if there are any changes to commit
//         let status = worktree_repo.statuses(None)?;
//         let has_changes = status.iter().any(|entry| {
//             let flags = entry.status();
//             flags.contains(git2::Status::INDEX_NEW)
//                 || flags.contains(git2::Status::INDEX_MODIFIED)
//                 || flags.contains(git2::Status::INDEX_DELETED)
//                 || flags.contains(git2::Status::WT_NEW)
//                 || flags.contains(git2::Status::WT_MODIFIED)
//                 || flags.contains(git2::Status::WT_DELETED)
//         });

//         if !has_changes {
//             return Ok::<(), Box<dyn std::error::Error + Send + Sync>>(());
//         }

//         // Get the current signature for commits
//         let signature = worktree_repo.signature()?;

//         // Get the current HEAD commit
//         let head = worktree_repo.head()?;
//         let parent_commit = head.peel_to_commit()?;

//         // Stage all changes
//         let mut worktree_index = worktree_repo.index()?;
//         worktree_index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
//         worktree_index.write()?;

//         let tree_id = worktree_index.write_tree()?;
//         let tree = worktree_repo.find_tree(tree_id)?;

//         // Create commit for the changes
//         let commit_message = if let Some(ref summary_msg) = summary {
//             summary_msg.clone()
//         } else {
//             format!("Task attempt {} - Final changes", attempt_id)
//         };
//         worktree_repo.commit(
//             Some("HEAD"),
//             &signature,
//             &signature,
//             &commit_message,
//             &tree,
//             &[&parent_commit],
//         )?;

//         Ok(())
//     })
//     .await??;

//     Ok(())
// }

// /// Handle setup script completion
// async fn handle_setup_completion(
//     app_state: &AppState,
//     task_attempt_id: Uuid,
//     execution_process: ExecutionProcess,
//     success: bool,
// ) {
//     if success {
//         // Mark setup as completed in database
//         if let Err(e) = TaskAttempt::mark_setup_completed(&app_state.db_pool, task_attempt_id).await
//         {
//             tracing::error!(
//                 "Failed to mark setup as completed for attempt {}: {}",
//                 task_attempt_id,
//                 e
//             );
//         }

//         // Setup completed successfully

//         // Check for delegation context in process args
//         let delegation_result = if let Some(args_json) = &execution_process.args {
//             parse_delegation_context(args_json)
//         } else {
//             None
//         };

//         if let Some(delegation_context) = delegation_result {
//             // Delegate to the original operation
//             handle_setup_delegation(app_state, delegation_context).await;
//         } else {
//             // Fallback to original behavior - start coding agent
//             if let Ok(Some(task_attempt)) =
//                 TaskAttempt::find_by_id(&app_state.db_pool, task_attempt_id).await
//             {
//                 if let Ok(Some(task)) =
//                     Task::find_by_id(&app_state.db_pool, task_attempt.task_id).await
//                 {
//                     // Start the coding agent
//                     if let Err(e) = ProcessService::start_coding_agent(
//                         &app_state.db_pool,
//                         app_state,
//                         task_attempt_id,
//                         task.id,
//                         task.project_id,
//                     )
//                     .await
//                     {
//                         tracing::error!(
//                             "Failed to start coding agent after setup completion: {}",
//                             e
//                         );
//                     }
//                 }
//             }
//         }
//     } else {
//         // Setup failed, update task status

//         // Update task status to InReview since setup failed
//         if let Ok(Some(task_attempt)) =
//             TaskAttempt::find_by_id(&app_state.db_pool, task_attempt_id).await
//         {
//             if let Ok(Some(task)) = Task::find_by_id(&app_state.db_pool, task_attempt.task_id).await
//             {
//                 if let Err(e) = Task::update_status(
//                     &app_state.db_pool,
//                     task.id,
//                     task.project_id,
//                     TaskStatus::InReview,
//                 )
//                 .await
//                 {
//                     tracing::error!(
//                         "Failed to update task status to InReview after setup failure: {}",
//                         e
//                     );
//                 }
//             }
//         }
//     }
// }

// /// Handle coding agent completion
// async fn handle_coding_agent_completion(
//     app_state: &AppState,
//     task_attempt_id: Uuid,
//     execution_process_id: Uuid,
//     execution_process: ExecutionProcess,
//     success: bool,
//     exit_code: Option<i64>,
// ) {
//     // Extract and store assistant message from execution logs
//     let summary = if let Some(stdout) = &execution_process.stdout {
//         if let Some(assistant_message) = crate::executor::parse_assistant_message_from_logs(stdout)
//         {
//             if let Err(e) = crate::models::executor_session::ExecutorSession::update_summary(
//                 &app_state.db_pool,
//                 execution_process_id,
//                 &assistant_message,
//             )
//             .await
//             {
//                 tracing::error!(
//                     "Failed to update summary for execution process {}: {}",
//                     execution_process_id,
//                     e
//                 );
//                 None
//             } else {
//                 tracing::info!(
//                     "Successfully stored summary for execution process {}",
//                     execution_process_id
//                 );
//                 Some(assistant_message)
//             }
//         } else {
//             None
//         }
//     } else {
//         None
//     };

//     // Note: Notifications and status updates moved to cleanup completion handler
//     // to ensure they only fire after all processing (including cleanup) is complete

//     // Get task attempt to access worktree path for committing changes
//     if let Ok(Some(task_attempt)) =
//         TaskAttempt::find_by_id(&app_state.db_pool, task_attempt_id).await
//     {
//         // Commit any unstaged changes after execution completion
//         if let Err(e) = commit_execution_changes(
//             &task_attempt.worktree_path,
//             task_attempt_id,
//             summary.as_deref(),
//         )
//         .await
//         {
//             tracing::error!(
//                 "Failed to commit execution changes for attempt {}: {}",
//                 task_attempt_id,
//                 e
//             );
//         } else {
//             tracing::info!(
//                 "Successfully committed execution changes for attempt {}",
//                 task_attempt_id
//             );
//         }

//         // Coding agent execution completed
//         tracing::info!(
//             "Task attempt {} set to paused after coding agent completion",
//             task_attempt_id
//         );

//         // Run cleanup script if configured, otherwise immediately finalize task
//         if let Ok(Some(task)) = Task::find_by_id(&app_state.db_pool, task_attempt.task_id).await {
//             // Check if cleanup script should run
//             let should_run_cleanup = if let Ok(Some(project)) =
//                 crate::models::project::Project::find_by_id(&app_state.db_pool, task.project_id)
//                     .await
//             {
//                 project
//                     .cleanup_script
//                     .as_ref()
//                     .map(|script| !script.trim().is_empty())
//                     .unwrap_or(false)
//             } else {
//                 false
//             };

//             if should_run_cleanup {
//                 // Run cleanup script - completion will be handled in cleanup completion handler
//                 if let Err(e) =
//                     crate::services::process_service::ProcessService::run_cleanup_script_if_configured(
//                         &app_state.db_pool,
//                         app_state,
//                         task_attempt_id,
//                         task_attempt.task_id,
//                         task.project_id,
//                     )
//                     .await
//                 {
//                     tracing::error!(
//                         "Failed to run cleanup script for attempt {}: {}",
//                         task_attempt_id,
//                         e
//                     );
//                     // Even if cleanup fails to start, finalize the task
//                     finalize_task_completion(app_state, task_attempt_id, &task, success, exit_code).await;
//                 }
//             } else {
//                 // No cleanup script configured, immediately finalize task
//                 finalize_task_completion(app_state, task_attempt_id, &task, success, exit_code)
//                     .await;
//             }
//         }
//     } else {
//         tracing::error!(
//             "Failed to find task attempt {} for coding agent completion",
//             task_attempt_id
//         );
//     }
// }

// // /// Finalize task completion with notifications and status updates
// async fn finalize_task_completion(
//     deployment: &DeploymentImpl,
//     task_attempt_id: Uuid,
//     task: db::models::task::Task,
//     success: bool,
//     exit_code: Option<i64>,
// ) {
//     // Track analytics event
//     deployment
//         .track_if_analytics_allowed(
//             "task_attempt_finished",
//             serde_json::json!({
//                 "task_id": task.id.to_string(),
//                 "project_id": task.project_id.to_string(),
//                 "attempt_id": task_attempt_id.to_string(),
//                 "execution_success": success,
//                 "exit_code": exit_code,
//             }),
//         )
//         .await;

//     // Update task status to InReview
//     if let Err(e) = Task::update_status(
//         &deployment.db().pool,
//         task.id,
//         task.project_id,
//         TaskStatus::InReview,
//     )
//     .await
//     {
//         tracing::error!(
//             "Failed to update task status to InReview for completed attempt: {}",
//             e
//         );
//     }
// }

// /// Handle cleanup script completion
// async fn handle_cleanup_completion(
//     app_state: &AppState,
//     task_attempt_id: Uuid,
//     execution_process_id: Uuid,
//     _execution_process: ExecutionProcess,
//     success: bool,
//     exit_code: Option<i64>,
// ) {
//     let exit_text = if let Some(code) = exit_code {
//         format!(" with exit code {}", code)
//     } else {
//         String::new()
//     };

//     tracing::info!(
//         "Cleanup script for task attempt {} completed{}",
//         task_attempt_id,
//         exit_text
//     );

//     // Update execution process status
//     let process_status = if success {
//         ExecutionProcessStatus::Completed
//     } else {
//         ExecutionProcessStatus::Failed
//     };

//     if let Err(e) = ExecutionProcess::update_completion(
//         &app_state.db_pool,
//         execution_process_id,
//         process_status,
//         exit_code,
//     )
//     .await
//     {
//         tracing::error!(
//             "Failed to update cleanup script execution process status: {}",
//             e
//         );
//     }

//     // Auto-commit changes after successful cleanup script execution
//     if success {
//         if let Ok(Some(task_attempt)) =
//             TaskAttempt::find_by_id(&app_state.db_pool, task_attempt_id).await
//         {
//             let commit_message = "Cleanup script";

//             if let Err(e) = commit_execution_changes(
//                 &task_attempt.worktree_path,
//                 task_attempt_id,
//                 Some(commit_message),
//             )
//             .await
//             {
//                 tracing::error!(
//                     "Failed to commit changes after cleanup script for attempt {}: {}",
//                     task_attempt_id,
//                     e
//                 );
//             } else {
//                 tracing::info!(
//                     "Successfully committed changes after cleanup script for attempt {}",
//                     task_attempt_id
//                 );
//             }
//         } else {
//             tracing::error!(
//                 "Failed to retrieve task attempt {} for cleanup commit",
//                 task_attempt_id
//             );
//         }
//     }

//     // Finalize task completion after cleanup (whether successful or failed)
//     if let Ok(Some(task_attempt)) =
//         TaskAttempt::find_by_id(&app_state.db_pool, task_attempt_id).await
//     {
//         if let Ok(Some(task)) = Task::find_by_id(&app_state.db_pool, task_attempt.task_id).await {
//             // Get the coding agent execution process to determine original success status
//             let coding_success = if let Ok(processes) =
//                 ExecutionProcess::find_by_task_attempt_id(&app_state.db_pool, task_attempt_id).await
//             {
//                 // Find the most recent completed coding agent process
//                 processes
//                     .iter()
//                     .filter(|p| {
//                         p.process_type
//                             == crate::models::execution_process::ExecutionProcessType::CodingAgent
//                     })
//                     .filter(|p| {
//                         p.status
//                             == crate::models::execution_process::ExecutionProcessStatus::Completed
//                     })
//                     .next_back()
//                     .map(|p| p.exit_code == Some(0))
//                     .unwrap_or(false)
//             } else {
//                 false
//             };

//             finalize_task_completion(app_state, task_attempt_id, &task, coding_success, exit_code)
//                 .await;
//         } else {
//             tracing::error!(
//                 "Failed to retrieve task {} for cleanup completion finalization",
//                 task_attempt.task_id
//             );
//         }
//     } else {
//         tracing::error!(
//             "Failed to retrieve task attempt {} for cleanup completion finalization",
//             task_attempt_id
//         );
//     }
// }

// /// Handle dev server completion (future functionality)
// async fn handle_dev_server_completion(
//     app_state: &AppState,
//     task_attempt_id: Uuid,
//     execution_process_id: Uuid,
//     _execution_process: ExecutionProcess,
//     success: bool,
//     exit_code: Option<i64>,
// ) {
//     let exit_text = if let Some(code) = exit_code {
//         format!(" with exit code {}", code)
//     } else {
//         String::new()
//     };

//     tracing::info!(
//         "Dev server for task attempt {} completed{}",
//         task_attempt_id,
//         exit_text
//     );

//     // Update execution process status instead of creating activity
//     let process_status = if success {
//         ExecutionProcessStatus::Completed
//     } else {
//         ExecutionProcessStatus::Failed
//     };

//     if let Err(e) = ExecutionProcess::update_completion(
//         &app_state.db_pool,
//         execution_process_id,
//         process_status,
//         exit_code,
//     )
//     .await
//     {
//         tracing::error!(
//             "Failed to update dev server execution process status: {}",
//             e
//         );
//     }
// }
