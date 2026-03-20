use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::command;
use thiserror::Error;

#[derive(Debug, Error)]
enum NativeError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentReport {
    platform: String,
    supported: bool,
    screen_count: i64,
    current_wallpaper_path: Option<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WallpaperApplyResult {
    local_path: String,
    applied_screen_count: i64,
}

fn escape_swift_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn run_swift_json(script: &str) -> Result<serde_json::Value, NativeError> {
    let output = Command::new("/usr/bin/swift").arg("-e").arg(script).output()?;

    if !output.status.success() {
        return Err(NativeError::Message(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(serde_json::from_str(stdout.trim())?)
}

#[cfg(target_os = "macos")]
fn inspect_macos_environment() -> Result<EnvironmentReport, NativeError> {
    let script = r#"
import AppKit
import Foundation

struct Output: Codable {
  let platform: String
  let supported: Bool
  let screenCount: Int
  let currentWallpaperPath: String?
  let warnings: [String]
}

let screens = NSScreen.screens
var warnings: [String] = []

if screens.count != 1 {
  warnings.append("MVP currently supports exactly one display.")
}

var currentPath: String? = nil
if let main = screens.first {
  if let wallpaperUrl = NSWorkspace.shared.desktopImageURL(for: main) {
    currentPath = wallpaperUrl.path
  } else {
    warnings.append("Unable to inspect the current wallpaper.")
  }
}

let output = Output(
  platform: "macOS",
  supported: warnings.isEmpty,
  screenCount: screens.count,
  currentWallpaperPath: currentPath,
  warnings: warnings
)

let encoded = try JSONEncoder().encode(output)
print(String(data: encoded, encoding: .utf8)!)
"#;

    let value = run_swift_json(script)?;
    Ok(serde_json::from_value(value)?)
}

#[cfg(not(target_os = "macos"))]
fn inspect_macos_environment() -> Result<EnvironmentReport, NativeError> {
    Ok(EnvironmentReport {
        platform: std::env::consts::OS.to_string(),
        supported: false,
        screen_count: 0,
        current_wallpaper_path: None,
        warnings: vec!["Friends Wall MVP only supports macOS.".to_string()],
    })
}

#[cfg(target_os = "macos")]
fn apply_macos_wallpaper(image_path: &str) -> Result<i64, NativeError> {
    let escaped_path = escape_swift_string(image_path);
    let script = format!(
        r#"
import AppKit
import Foundation

let path = "{escaped_path}"
let url = URL(fileURLWithPath: path)

guard FileManager.default.fileExists(atPath: path) else {{
  fputs("Wallpaper file not found.\n", stderr)
  exit(1)
}}

for screen in NSScreen.screens {{
  try NSWorkspace.shared.setDesktopImageURL(url, for: screen, options: [:])
}}

print("{{\"appliedScreenCount\": \(NSScreen.screens.count)}}")
"#
    );

    let output = run_swift_json(&script)?;
    Ok(output["appliedScreenCount"].as_i64().unwrap_or(0))
}

#[cfg(not(target_os = "macos"))]
fn apply_macos_wallpaper(_image_path: &str) -> Result<i64, NativeError> {
    Err(NativeError::Message(
        "Wallpaper application only works on macOS.".to_string(),
    ))
}

async fn download_asset(source_url: &str, file_name: &str) -> Result<PathBuf, NativeError> {
    let response = Client::new().get(source_url).send().await?.error_for_status()?;
    let bytes = response.bytes().await?;

    let temp_dir = std::env::temp_dir().join("friends-wall");
    fs::create_dir_all(&temp_dir)?;

    let sanitized_name = file_name
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => character,
        })
        .collect::<String>();

    let path = temp_dir.join(format!("{}-{}", uuid_like_suffix(), sanitized_name));
    fs::write(&path, &bytes)?;

    Ok(path)
}

fn uuid_like_suffix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();

    millis.to_string()
}

#[command]
fn inspect_environment() -> Result<EnvironmentReport, String> {
    inspect_macos_environment().map_err(|error| error.to_string())
}

#[command]
async fn apply_wallpaper_from_url(
    source_url: String,
    file_name: String,
) -> Result<WallpaperApplyResult, String> {
    let local_path = download_asset(&source_url, &file_name)
        .await
        .map_err(|error| error.to_string())?;
    let applied_screen_count =
        apply_macos_wallpaper(local_path.to_string_lossy().as_ref()).map_err(|error| error.to_string())?;

    Ok(WallpaperApplyResult {
      local_path: local_path.to_string_lossy().to_string(),
      applied_screen_count,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            inspect_environment,
            apply_wallpaper_from_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
