//! Windows primitives for portable updates. No shell commands or elevated process.
use std::{ffi::c_void, fs::File, io::Read, path::Path};

type Handle = *mut c_void;
#[link(name = "bcrypt")]
extern "system" {
    fn BCryptOpenAlgorithmProvider(
        out: *mut Handle,
        name: *const u16,
        implementation: *const u16,
        flags: u32,
    ) -> i32;
    fn BCryptCloseAlgorithmProvider(handle: Handle, flags: u32) -> i32;
    fn BCryptCreateHash(
        algorithm: Handle,
        out: *mut Handle,
        object: *mut u8,
        length: u32,
        secret: *mut u8,
        secret_length: u32,
        flags: u32,
    ) -> i32;
    fn BCryptHashData(hash: Handle, data: *const u8, length: u32, flags: u32) -> i32;
    fn BCryptFinishHash(hash: Handle, output: *mut u8, length: u32, flags: u32) -> i32;
    fn BCryptDestroyHash(hash: Handle) -> i32;
}
#[link(name = "kernel32")]
extern "system" {
    fn MoveFileExW(source: *const u16, target: *const u16, flags: u32) -> i32;
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
    fn WaitForSingleObject(handle: Handle, timeout: u32) -> u32;
    fn CloseHandle(handle: Handle) -> i32;
}

pub fn hash_file(path: &Path) -> Result<String, String> {
    struct Hash(Handle, Handle);
    impl Drop for Hash {
        fn drop(&mut self) {
            unsafe {
                if !self.1.is_null() {
                    BCryptDestroyHash(self.1);
                }
                if !self.0.is_null() {
                    BCryptCloseAlgorithmProvider(self.0, 0);
                }
            }
        }
    }
    let mut hash = Hash(std::ptr::null_mut(), std::ptr::null_mut());
    let name: Vec<u16> = "SHA256\0".encode_utf16().collect();
    unsafe {
        if BCryptOpenAlgorithmProvider(&mut hash.0, name.as_ptr(), std::ptr::null(), 0) < 0
            || BCryptCreateHash(
                hash.0,
                &mut hash.1,
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                0,
                0,
            ) < 0
        {
            return Err("无法初始化更新校验".into());
        }
    }
    let mut file = File::open(path).map_err(|_| "无法读取更新文件")?;
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer).map_err(|_| "读取更新文件失败")?;
        if count == 0 {
            break;
        }
        if unsafe { BCryptHashData(hash.1, buffer.as_ptr(), count as u32, 0) } < 0 {
            return Err("更新校验失败".into());
        }
    }
    let mut digest = [0u8; 32];
    if unsafe { BCryptFinishHash(hash.1, digest.as_mut_ptr(), 32, 0) } < 0 {
        return Err("更新校验失败".into());
    }
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn replace(source: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe { MoveFileExW(source.as_ptr(), target.as_ptr(), 1 | 8) } == 0 {
        let code = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
        return Err(format!("程序文件被占用或无替换权限（Windows 错误 {code}），已保留旧版。请关闭其他实例，或将软件移到可写目录后重试"));
    }
    Ok(())
}

pub struct Parent(Handle);
impl Parent {
    pub fn open(pid: u32) -> Result<Self, String> {
        let handle = unsafe { OpenProcess(0x00100000, 0, pid) }; // SYNCHRONIZE only
        if handle.is_null() {
            Err("无法等待旧程序退出".into())
        } else {
            Ok(Self(handle))
        }
    }
    pub fn wait(&self) -> Result<(), String> {
        if unsafe { WaitForSingleObject(self.0, 90000) } == 0 {
            Ok(())
        } else {
            Err("旧程序未能退出，更新未执行".into())
        }
    }
}
impl Drop for Parent {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
