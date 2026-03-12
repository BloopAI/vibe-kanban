//! Extension trait for `command_group::AsyncCommandGroup` that sets
//! `CREATE_NO_WINDOW` on Windows to prevent background processes from
//! opening visible console windows.

use command_group::{AsyncCommandGroup, AsyncGroupChild};

pub(crate) trait GroupSpawnNoWindow {
    fn group_spawn_no_window(&mut self) -> std::io::Result<AsyncGroupChild>;
}

impl GroupSpawnNoWindow for tokio::process::Command {
    fn group_spawn_no_window(&mut self) -> std::io::Result<AsyncGroupChild> {
        let mut group = self.group();
        #[cfg(windows)]
        group.creation_flags(0x08000000); // CREATE_NO_WINDOW
        group.spawn()
    }
}
