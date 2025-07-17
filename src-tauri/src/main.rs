// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{async_runtime, Manager, Window, menu::{Menu, MenuItem, PredefinedMenuItem}};
use tauri::tray::TrayIconEvent;
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
async fn start_backend_server() -> Result<String, String> {
    let port = start_embedded_backend().await.map_err(|e| e.to_string())?;
    Ok(format!("Backend started on port {port}"))
}

async fn start_embedded_backend() -> Result<u16, anyhow::Error> {
    // This will start the backend server in a separate task
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tokio::spawn(async move {
        match run_backend_server().await {
            Ok(port) => {
                let _ = tx.send(port);
            }
            Err(e) => {
                eprintln!("Failed to start backend server: {e}");
                let _ = tx.send(0);
            }
        }
    });
    
    let port = rx.await.unwrap_or(0);
    if port == 0 {
        return Err(anyhow::anyhow!("Failed to start backend server"));
    }
    
    Ok(port)
}

async fn run_backend_server() -> Result<u16, anyhow::Error> {
    // This is simplified - in practice you'd want to extract the server startup
    // logic from backend/src/main.rs into a library function
    
    // For now, we'll use a basic server on a random port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    
    println!("Backend server starting on port {port}");
    
    // Here you would start your actual backend server
    // For now we'll just keep the listener alive
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });
    
    Ok(port)
}

#[tauri::command]
async fn get_backend_url() -> String {
    // In a real implementation, you'd store the port from backend startup
    "http://127.0.0.1:3001".to_string()
}

#[tauri::command]
async fn show_notification(window: Window, title: &str, body: &str) -> Result<(), String> {
    window
        .app_handle()
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn minimize_to_tray(window: Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn restore_from_tray(window: Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn send_notification(window: Window, title: &str, body: &str) -> Result<(), String> {
    window
        .app_handle()
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            start_backend_server,
            get_backend_url,
            show_notification,
            minimize_to_tray,
            restore_from_tray,
            send_notification
        ])
        .setup(|app| {
            // Start backend server on app startup
            async_runtime::spawn(async move {
                if let Err(e) = start_embedded_backend().await {
                    eprintln!("Failed to start embedded backend: {e}");
                }
            });
            
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            // Set up system tray with menu
            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();
            
            // Create tray menu
            let show_item = MenuItem::new(app, "Show Vibe Kanban", true, None::<&str>).unwrap();
            let hide_item = MenuItem::new(app, "Hide Window", true, None::<&str>).unwrap();
            let separator = PredefinedMenuItem::separator(app).unwrap();
            let new_project_item = MenuItem::new(app, "New Project", true, None::<&str>).unwrap();
            let new_task_item = MenuItem::new(app, "New Task", true, None::<&str>).unwrap();
            let quit_item = PredefinedMenuItem::quit(app, Some("Quit")).unwrap();
            
            let tray_menu = Menu::with_items(app, &[
                &show_item,
                &hide_item,
                &separator,
                &new_project_item,
                &new_task_item,
                &separator,
                &quit_item,
            ]).unwrap();
            
            // Set tray menu
            app.tray_by_id("main").unwrap().set_menu(Some(tray_menu)).unwrap();
            
            // Handle tray icon clicks
            app.tray_by_id("main").unwrap().on_tray_icon_event(move |_tray, event| {
                if let TrayIconEvent::Click { .. } = event {
                    let _ = window_clone.show();
                    let _ = window_clone.set_focus();
                }
            });
            
            // Handle tray menu events
            app.on_menu_event(move |app, event| {
                let window = app.get_webview_window("main").unwrap();
                match event.id.as_ref() {
                    "Show Vibe Kanban" => {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    "Hide Window" => {
                        let _ = window.hide();
                    }
                    "New Project" => {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.eval("window.location.href = '/projects?new=true'");
                    }
                    "New Task" => {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.eval("window.location.href = '/projects?new_task=true'");
                    }
                    _ => {}
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}