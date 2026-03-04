mod workspace_manager;

pub use workspace_manager::{
    AddRepoToWorkspaceError, AddRepoToWorkspaceResult, ManagedWorkspace, ManagedWorkspaceOps,
    RepoWorkspaceInput, RepoWorktree, WorkspaceDeletionContext, WorkspaceError, WorkspaceManager,
    WorktreeContainer,
};
