//! SFTP subsystem handler implementing `russh_sftp::server::Handler`.
//!
//! Provides filesystem operations (read, write, stat, readdir, etc.) needed
//! by VS Code Remote SSH for file browsing and editing.

#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, Write},
    path::PathBuf,
};

use russh_sftp::protocol::{
    Attrs, Data, File, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode, Version,
};

#[derive(Default)]
pub struct SftpHandler {
    next_handle: u64,
    file_handles: HashMap<String, FileHandle>,
    dir_handles: HashMap<String, DirHandle>,
}

struct FileHandle {
    file: std::fs::File,
    #[allow(dead_code)]
    path: PathBuf,
}

struct DirHandle {
    path: PathBuf,
    entries_sent: bool,
}

/// Error type that converts to SFTP StatusCode.
pub struct SftpError {
    code: StatusCode,
    #[allow(dead_code)]
    message: String,
}

impl From<std::io::Error> for SftpError {
    fn from(err: std::io::Error) -> Self {
        let code = match err.kind() {
            std::io::ErrorKind::NotFound => StatusCode::NoSuchFile,
            std::io::ErrorKind::PermissionDenied => StatusCode::PermissionDenied,
            _ => StatusCode::Failure,
        };
        SftpError {
            code,
            message: err.to_string(),
        }
    }
}

impl From<SftpError> for StatusCode {
    fn from(err: SftpError) -> StatusCode {
        err.code
    }
}

impl SftpHandler {
    fn alloc_handle(&mut self) -> String {
        let h = self.next_handle;
        self.next_handle += 1;
        format!("h{h}")
    }

    fn ok_status(&self, id: u32) -> Status {
        Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en".to_string(),
        }
    }
}

fn metadata_to_file_attrs(meta: &fs::Metadata) -> FileAttributes {
    #[cfg(unix)]
    {
        FileAttributes {
            size: Some(meta.size()),
            uid: Some(meta.uid()),
            user: None,
            gid: Some(meta.gid()),
            group: None,
            permissions: Some(meta.permissions().mode()),
            atime: Some(meta.atime() as u32),
            mtime: Some(meta.mtime() as u32),
        }
    }

    #[cfg(not(unix))]
    {
        FileAttributes {
            size: Some(meta.len()),
            uid: None,
            user: None,
            gid: None,
            group: None,
            permissions: None,
            atime: None,
            mtime: None,
        }
    }
}

impl russh_sftp::server::Handler for SftpHandler {
    type Error = SftpError;

    fn unimplemented(&self) -> Self::Error {
        SftpError {
            code: StatusCode::OpUnsupported,
            message: "Unimplemented SFTP operation".to_string(),
        }
    }

    async fn init(
        &mut self,
        _version: u32,
        _extensions: HashMap<String, String>,
    ) -> Result<Version, Self::Error> {
        Ok(Version::new())
    }

    fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: OpenFlags,
        _attrs: FileAttributes,
    ) -> impl std::future::Future<Output = Result<Handle, Self::Error>> + Send {
        let path = PathBuf::from(filename);
        async move {
            tokio::task::block_in_place(|| {
                let mut opts = fs::OpenOptions::new();

                if pflags.contains(OpenFlags::READ) {
                    opts.read(true);
                }
                if pflags.contains(OpenFlags::WRITE) {
                    opts.write(true);
                }
                if pflags.contains(OpenFlags::APPEND) {
                    opts.append(true);
                }
                if pflags.contains(OpenFlags::CREATE) {
                    opts.create(true);
                }
                if pflags.contains(OpenFlags::TRUNCATE) {
                    opts.truncate(true);
                }
                if pflags.contains(OpenFlags::EXCLUDE) {
                    opts.create_new(true);
                }

                opts.open(&path)
                    .map(|file| {
                        let handle = self.alloc_handle();
                        self.file_handles
                            .insert(handle.clone(), FileHandle { file, path });
                        Handle { id, handle }
                    })
                    .map_err(SftpError::from)
            })
        }
    }

    fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> impl std::future::Future<Output = Result<Data, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                let fh = self.file_handles.get_mut(&handle).ok_or(SftpError {
                    code: StatusCode::Failure,
                    message: "Invalid handle".to_string(),
                })?;

                fh.file
                    .seek(std::io::SeekFrom::Start(offset))
                    .map_err(SftpError::from)?;
                let mut buf = vec![0u8; len as usize];
                let n = fh.file.read(&mut buf).map_err(SftpError::from)?;
                if n == 0 {
                    return Err(SftpError {
                        code: StatusCode::Eof,
                        message: "EOF".to_string(),
                    });
                }
                buf.truncate(n);
                Ok(Data { id, data: buf })
            })
        }
    }

    fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> impl std::future::Future<Output = Result<Status, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                let fh = self.file_handles.get_mut(&handle).ok_or(SftpError {
                    code: StatusCode::Failure,
                    message: "Invalid handle".to_string(),
                })?;

                fh.file
                    .seek(std::io::SeekFrom::Start(offset))
                    .map_err(SftpError::from)?;
                fh.file.write_all(&data).map_err(SftpError::from)?;
                Ok(self.ok_status(id))
            })
        }
    }

    fn close(
        &mut self,
        id: u32,
        handle: String,
    ) -> impl std::future::Future<Output = Result<Status, Self::Error>> + Send {
        let removed = self.file_handles.remove(&handle).is_some()
            || self.dir_handles.remove(&handle).is_some();
        let status = self.ok_status(id);
        async move {
            if removed {
                Ok(status)
            } else {
                Err(SftpError {
                    code: StatusCode::Failure,
                    message: "Invalid handle".to_string(),
                })
            }
        }
    }

    fn stat(
        &mut self,
        id: u32,
        path: String,
    ) -> impl std::future::Future<Output = Result<Attrs, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                fs::metadata(&path)
                    .map(|meta| Attrs {
                        id,
                        attrs: metadata_to_file_attrs(&meta),
                    })
                    .map_err(SftpError::from)
            })
        }
    }

    fn lstat(
        &mut self,
        id: u32,
        path: String,
    ) -> impl std::future::Future<Output = Result<Attrs, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                fs::symlink_metadata(&path)
                    .map(|meta| Attrs {
                        id,
                        attrs: metadata_to_file_attrs(&meta),
                    })
                    .map_err(SftpError::from)
            })
        }
    }

    fn fstat(
        &mut self,
        id: u32,
        handle: String,
    ) -> impl std::future::Future<Output = Result<Attrs, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                self.file_handles
                    .get(&handle)
                    .ok_or(SftpError {
                        code: StatusCode::Failure,
                        message: "Invalid handle".to_string(),
                    })
                    .and_then(|fh| fh.file.metadata().map_err(SftpError::from))
                    .map(|meta| Attrs {
                        id,
                        attrs: metadata_to_file_attrs(&meta),
                    })
            })
        }
    }

    fn opendir(
        &mut self,
        id: u32,
        path: String,
    ) -> impl std::future::Future<Output = Result<Handle, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                let p = PathBuf::from(&path);
                if !p.is_dir() {
                    return Err(SftpError {
                        code: StatusCode::NoSuchFile,
                        message: "Not a directory".to_string(),
                    });
                }
                let handle = self.alloc_handle();
                self.dir_handles.insert(
                    handle.clone(),
                    DirHandle {
                        path: p,
                        entries_sent: false,
                    },
                );
                Ok(Handle { id, handle })
            })
        }
    }

    fn readdir(
        &mut self,
        id: u32,
        handle: String,
    ) -> impl std::future::Future<Output = Result<Name, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                let dh = self.dir_handles.get_mut(&handle).ok_or(SftpError {
                    code: StatusCode::Failure,
                    message: "Invalid handle".to_string(),
                })?;

                if dh.entries_sent {
                    return Err(SftpError {
                        code: StatusCode::Eof,
                        message: "EOF".to_string(),
                    });
                }

                let mut files = Vec::new();
                for entry in fs::read_dir(&dh.path).map_err(SftpError::from)? {
                    let entry = entry.map_err(SftpError::from)?;
                    let meta = entry.metadata().map_err(SftpError::from)?;
                    let filename = entry.file_name().to_string_lossy().into_owned();
                    let longname = format_longname(&filename, &meta);
                    let attrs = metadata_to_file_attrs(&meta);

                    files.push(File {
                        filename,
                        longname,
                        attrs,
                    });
                }

                dh.entries_sent = true;
                Ok(Name { id, files })
            })
        }
    }

    fn mkdir(
        &mut self,
        id: u32,
        path: String,
        _attrs: FileAttributes,
    ) -> impl std::future::Future<Output = Result<Status, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                fs::create_dir_all(&path)
                    .map(|_| self.ok_status(id))
                    .map_err(SftpError::from)
            })
        }
    }

    fn rmdir(
        &mut self,
        id: u32,
        path: String,
    ) -> impl std::future::Future<Output = Result<Status, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                fs::remove_dir(&path)
                    .map(|_| self.ok_status(id))
                    .map_err(SftpError::from)
            })
        }
    }

    fn remove(
        &mut self,
        id: u32,
        filename: String,
    ) -> impl std::future::Future<Output = Result<Status, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                fs::remove_file(&filename)
                    .map(|_| self.ok_status(id))
                    .map_err(SftpError::from)
            })
        }
    }

    fn rename(
        &mut self,
        id: u32,
        oldpath: String,
        newpath: String,
    ) -> impl std::future::Future<Output = Result<Status, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                fs::rename(&oldpath, &newpath)
                    .map(|_| self.ok_status(id))
                    .map_err(SftpError::from)
            })
        }
    }

    fn realpath(
        &mut self,
        id: u32,
        path: String,
    ) -> impl std::future::Future<Output = Result<Name, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                fs::canonicalize(&path)
                    .map(|canonical| {
                        let filename = canonical.to_string_lossy().into_owned();
                        Name {
                            id,
                            files: vec![File {
                                filename,
                                longname: String::new(),
                                attrs: FileAttributes::default(),
                            }],
                        }
                    })
                    .map_err(SftpError::from)
            })
        }
    }

    fn setstat(
        &mut self,
        id: u32,
        path: String,
        attrs: FileAttributes,
    ) -> impl std::future::Future<Output = Result<Status, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                if let Some(perms) = attrs.permissions {
                    #[cfg(unix)]
                    fs::set_permissions(&path, fs::Permissions::from_mode(perms))
                        .map_err(SftpError::from)?;
                    #[cfg(not(unix))]
                    let _ = perms;
                }
                Ok(self.ok_status(id))
            })
        }
    }

    fn symlink(
        &mut self,
        id: u32,
        linkpath: String,
        targetpath: String,
    ) -> impl std::future::Future<Output = Result<Status, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                #[cfg(unix)]
                {
                    std::os::unix::fs::symlink(&targetpath, &linkpath)
                        .map(|_| self.ok_status(id))
                        .map_err(SftpError::from)
                }
                #[cfg(windows)]
                {
                    let symlink_result = if fs::metadata(&targetpath)
                        .map(|m| m.is_dir())
                        .unwrap_or(false)
                    {
                        std::os::windows::fs::symlink_dir(&targetpath, &linkpath)
                    } else {
                        std::os::windows::fs::symlink_file(&targetpath, &linkpath)
                    };
                    symlink_result
                        .map(|_| self.ok_status(id))
                        .map_err(SftpError::from)
                }
                #[cfg(not(any(unix, windows)))]
                {
                    Err(SftpError {
                        code: StatusCode::OpUnsupported,
                        message: "Symlink is unsupported on this platform".to_string(),
                    })
                }
            })
        }
    }

    fn readlink(
        &mut self,
        id: u32,
        path: String,
    ) -> impl std::future::Future<Output = Result<Name, Self::Error>> + Send {
        async move {
            tokio::task::block_in_place(|| {
                fs::read_link(&path)
                    .map(|target| {
                        let filename = target.to_string_lossy().into_owned();
                        Name {
                            id,
                            files: vec![File {
                                filename,
                                longname: String::new(),
                                attrs: FileAttributes::default(),
                            }],
                        }
                    })
                    .map_err(SftpError::from)
            })
        }
    }
}

#[cfg(unix)]
fn format_longname(name: &str, meta: &fs::Metadata) -> String {
    let file_type = if meta.is_dir() {
        "d"
    } else if meta.file_type().is_symlink() {
        "l"
    } else {
        "-"
    };
    let size = meta.len();
    format!(
        "{file_type}rwxr-xr-x 1 {uid} {gid} {size} Jan 1 00:00 {name}",
        uid = meta.uid(),
        gid = meta.gid(),
    )
}

#[cfg(not(unix))]
fn format_longname(name: &str, meta: &fs::Metadata) -> String {
    let file_type = if meta.is_dir() {
        "d"
    } else if meta.file_type().is_symlink() {
        "l"
    } else {
        "-"
    };
    let size = meta.len();
    format!("{file_type}rwxr-xr-x 1 0 0 {size} Jan 1 00:00 {name}")
}
