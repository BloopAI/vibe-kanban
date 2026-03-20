//! SFTP subsystem handler implementing `russh_sftp::server::Handler`.
//!
//! Provides filesystem operations (read, write, stat, readdir, etc.) needed
//! by VS Code Remote SSH for file browsing and editing.

#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::{collections::HashMap, fs as std_fs, path::PathBuf};

use russh_sftp::protocol::{
    Attrs, Data, File, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode, Version,
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
};

#[derive(Default)]
pub struct SftpHandler {
    next_handle: u64,
    file_handles: HashMap<String, FileHandle>,
    dir_handles: HashMap<String, DirHandle>,
}

struct FileHandle {
    file: fs::File,
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

fn metadata_to_file_attrs(meta: &std_fs::Metadata) -> FileAttributes {
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

    async fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: OpenFlags,
        _attrs: FileAttributes,
    ) -> Result<Handle, Self::Error> {
        let path = PathBuf::from(filename);
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

        let file = opts.open(&path).await.map_err(SftpError::from)?;
        let handle = self.alloc_handle();
        self.file_handles
            .insert(handle.clone(), FileHandle { file, path });

        Ok(Handle { id, handle })
    }

    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<Data, Self::Error> {
        let fh = self.file_handles.get_mut(&handle).ok_or(SftpError {
            code: StatusCode::Failure,
            message: "Invalid handle".to_string(),
        })?;

        fh.file
            .seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(SftpError::from)?;

        let mut buf = vec![0u8; len as usize];
        let n = fh.file.read(&mut buf).await.map_err(SftpError::from)?;

        if n == 0 {
            return Err(SftpError {
                code: StatusCode::Eof,
                message: "EOF".to_string(),
            });
        }

        buf.truncate(n);
        Ok(Data { id, data: buf })
    }

    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Status, Self::Error> {
        let fh = self.file_handles.get_mut(&handle).ok_or(SftpError {
            code: StatusCode::Failure,
            message: "Invalid handle".to_string(),
        })?;

        fh.file
            .seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(SftpError::from)?;
        fh.file.write_all(&data).await.map_err(SftpError::from)?;

        Ok(self.ok_status(id))
    }

    async fn close(&mut self, id: u32, handle: String) -> Result<Status, Self::Error> {
        let removed = self.file_handles.remove(&handle).is_some()
            || self.dir_handles.remove(&handle).is_some();

        if removed {
            Ok(self.ok_status(id))
        } else {
            Err(SftpError {
                code: StatusCode::Failure,
                message: "Invalid handle".to_string(),
            })
        }
    }

    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let meta = fs::metadata(&path).await.map_err(SftpError::from)?;
        Ok(Attrs {
            id,
            attrs: metadata_to_file_attrs(&meta),
        })
    }

    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let meta = fs::symlink_metadata(&path).await.map_err(SftpError::from)?;
        Ok(Attrs {
            id,
            attrs: metadata_to_file_attrs(&meta),
        })
    }

    async fn fstat(&mut self, id: u32, handle: String) -> Result<Attrs, Self::Error> {
        let fh = self.file_handles.get_mut(&handle).ok_or(SftpError {
            code: StatusCode::Failure,
            message: "Invalid handle".to_string(),
        })?;

        let meta = fh.file.metadata().await.map_err(SftpError::from)?;
        Ok(Attrs {
            id,
            attrs: metadata_to_file_attrs(&meta),
        })
    }

    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        let p = PathBuf::from(&path);
        let meta = fs::metadata(&p).await.map_err(SftpError::from)?;
        if !meta.is_dir() {
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
    }

    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        let dir_path = {
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

            dh.path.clone()
        };

        let mut entries = fs::read_dir(&dir_path).await.map_err(SftpError::from)?;
        let mut files = Vec::new();

        while let Some(entry) = entries.next_entry().await.map_err(SftpError::from)? {
            let meta = entry.metadata().await.map_err(SftpError::from)?;
            let filename = entry.file_name().to_string_lossy().into_owned();
            let longname = format_longname(&filename, &meta);
            let attrs = metadata_to_file_attrs(&meta);

            files.push(File {
                filename,
                longname,
                attrs,
            });
        }

        if let Some(dh) = self.dir_handles.get_mut(&handle) {
            dh.entries_sent = true;
        }

        Ok(Name { id, files })
    }

    async fn mkdir(
        &mut self,
        id: u32,
        path: String,
        _attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        fs::create_dir_all(&path).await.map_err(SftpError::from)?;
        Ok(self.ok_status(id))
    }

    async fn rmdir(&mut self, id: u32, path: String) -> Result<Status, Self::Error> {
        fs::remove_dir(&path).await.map_err(SftpError::from)?;
        Ok(self.ok_status(id))
    }

    async fn remove(&mut self, id: u32, filename: String) -> Result<Status, Self::Error> {
        fs::remove_file(&filename).await.map_err(SftpError::from)?;
        Ok(self.ok_status(id))
    }

    async fn rename(
        &mut self,
        id: u32,
        oldpath: String,
        newpath: String,
    ) -> Result<Status, Self::Error> {
        fs::rename(&oldpath, &newpath)
            .await
            .map_err(SftpError::from)?;
        Ok(self.ok_status(id))
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        let canonical = fs::canonicalize(&path).await.map_err(SftpError::from)?;
        let filename = canonical.to_string_lossy().into_owned();

        Ok(Name {
            id,
            files: vec![File {
                filename,
                longname: String::new(),
                attrs: FileAttributes::default(),
            }],
        })
    }

    async fn setstat(
        &mut self,
        id: u32,
        path: String,
        attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        if let Some(perms) = attrs.permissions {
            #[cfg(unix)]
            fs::set_permissions(&path, std_fs::Permissions::from_mode(perms))
                .await
                .map_err(SftpError::from)?;
            #[cfg(not(unix))]
            let _ = perms;
        }

        Ok(self.ok_status(id))
    }

    async fn symlink(
        &mut self,
        id: u32,
        linkpath: String,
        targetpath: String,
    ) -> Result<Status, Self::Error> {
        #[cfg(unix)]
        {
            fs::symlink(&targetpath, &linkpath)
                .await
                .map_err(SftpError::from)?;
            Ok(self.ok_status(id))
        }

        #[cfg(windows)]
        {
            let is_dir = fs::metadata(&targetpath)
                .await
                .map(|m| m.is_dir())
                .unwrap_or(false);

            if is_dir {
                fs::symlink_dir(&targetpath, &linkpath)
                    .await
                    .map_err(SftpError::from)?;
            } else {
                fs::symlink_file(&targetpath, &linkpath)
                    .await
                    .map_err(SftpError::from)?;
            }

            Ok(self.ok_status(id))
        }

        #[cfg(not(any(unix, windows)))]
        {
            let _ = (id, linkpath, targetpath);
            Err(SftpError {
                code: StatusCode::OpUnsupported,
                message: "Symlink is unsupported on this platform".to_string(),
            })
        }
    }

    async fn readlink(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        let target = fs::read_link(&path).await.map_err(SftpError::from)?;
        let filename = target.to_string_lossy().into_owned();

        Ok(Name {
            id,
            files: vec![File {
                filename,
                longname: String::new(),
                attrs: FileAttributes::default(),
            }],
        })
    }
}

#[cfg(unix)]
fn format_longname(name: &str, meta: &std_fs::Metadata) -> String {
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
fn format_longname(name: &str, meta: &std_fs::Metadata) -> String {
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
