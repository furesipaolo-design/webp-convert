use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

// Common install locations for cwebp (GUI apps don't inherit shell PATH)
const CWEBP_CANDIDATES: &[&str] = &[
    "/opt/homebrew/bin/cwebp",   // macOS Apple Silicon (Homebrew)
    "/usr/local/bin/cwebp",      // macOS Intel (Homebrew) / Linux custom
    "/usr/bin/cwebp",            // Linux (apt/dnf)
    "/usr/local/sbin/cwebp",
    "cwebp",                     // fallback: rely on PATH if somehow set
];

fn find_cwebp() -> Option<String> {
    for candidate in CWEBP_CANDIDATES {
        let exists = if candidate.starts_with('/') {
            Path::new(candidate).exists()
        } else {
            // bare name: try running it
            Command::new(candidate)
                .arg("-version")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        };
        if exists {
            return Some(candidate.to_string());
        }
    }
    None
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ToolInfo {
    pub found: bool,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ConvertResult {
    pub input: String,
    pub output: String,
    pub size_before: u64,
    pub size_after: u64,
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
fn detect_tools() -> ToolInfo {
    match find_cwebp() {
        Some(path) => ToolInfo { found: true, path },
        None => ToolInfo { found: false, path: String::new() },
    }
}

#[tauri::command]
fn list_images_in_dir(dir: String) -> Vec<String> {
    let mut result = Vec::new();
    let Ok(entries) = fs::read_dir(&dir) else { return result };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let ext = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if matches!(ext.as_str(), "jpg" | "jpeg" | "png") {
                result.push(path.to_string_lossy().to_string());
            }
        }
    }
    result
}

#[tauri::command]
fn convert_files(files: Vec<String>, quality: u8) -> Vec<ConvertResult> {
    let cwebp = match find_cwebp() {
        Some(p) => p,
        None => {
            return files.iter().map(|f| ConvertResult {
                input: f.clone(),
                output: String::new(),
                size_before: 0,
                size_after: 0,
                success: false,
                error: Some("cwebp non trovato. Installa con: brew install webp".to_string()),
            }).collect();
        }
    };

    files.iter().map(|input| {
        let input_path = Path::new(input);

        let parent = match input_path.parent() {
            Some(p) => p.to_path_buf(),
            None => return ConvertResult {
                input: input.clone(),
                output: String::new(),
                size_before: 0,
                size_after: 0,
                success: false,
                error: Some("Impossibile determinare la cartella del file".to_string()),
            },
        };

        let stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
        let webp_dir = parent.join("WEBP");
        let output_path = webp_dir.join(format!("{}.webp", stem));

        if let Err(e) = fs::create_dir_all(&webp_dir) {
            return ConvertResult {
                input: input.clone(),
                output: String::new(),
                size_before: 0,
                size_after: 0,
                success: false,
                error: Some(format!("Impossibile creare cartella WEBP/: {}", e)),
            };
        }

        let size_before = fs::metadata(input).map(|m| m.len()).unwrap_or(0);
        let output_str = output_path.to_string_lossy().to_string();

        let status = Command::new(&cwebp)
            .args(["-q", &quality.to_string(), input, "-o", &output_str])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        match status {
            Ok(s) if s.success() => {
                let size_after = fs::metadata(&output_str).map(|m| m.len()).unwrap_or(0);
                ConvertResult {
                    input: input.clone(),
                    output: output_str,
                    size_before,
                    size_after,
                    success: true,
                    error: None,
                }
            }
            Ok(s) => ConvertResult {
                input: input.clone(),
                output: output_str,
                size_before,
                size_after: 0,
                success: false,
                error: Some(format!("cwebp uscito con codice {}", s.code().unwrap_or(-1))),
            },
            Err(e) => ConvertResult {
                input: input.clone(),
                output: output_str,
                size_before,
                size_after: 0,
                success: false,
                error: Some(format!("Errore avvio cwebp: {}", e)),
            },
        }
    }).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![detect_tools, list_images_in_dir, convert_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
