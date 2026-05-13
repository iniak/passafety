use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

mod commands;
pub mod vault;

pub use commands::*;
pub use vault::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 当第二个实例启动时，显示并聚焦主窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .setup(|app| {
            // Portable mode: vault.db lives next to the executable.
            // Falls back to the app data directory only if the exe path can't be resolved.
            let db_path = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.join("vault.db")))
                .unwrap_or_else(|| {
                    let app_data_dir = app.path().app_data_dir()
                        .expect("Failed to get app data directory");
                    std::fs::create_dir_all(&app_data_dir).ok();
                    app_data_dir.join("vault.db")
                });

            let vault_state = VaultState::new(db_path)
                .expect("Failed to initialize vault state");

            app.manage(Mutex::new(vault_state));

            // 创建系统托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘图标
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 监听窗口关闭事件，隐藏而不是退出
            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // 阻止窗口关闭
                        api.prevent_close();
                        // 隐藏窗口
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::unlock_vault,
            commands::setup_vault,
            commands::lock_vault,
            commands::get_password_hint,
            commands::change_master_password,
            commands::is_vault_initialized,
            commands::get_entries,
            commands::add_entry,
            commands::update_entry,
            commands::delete_entry,
            commands::reorder_entries,
            commands::move_entries_to_group,
            commands::get_groups,
            commands::add_group,
            commands::delete_group,
            commands::export_csv,
            commands::export_csv_selected,
            commands::import_csv,
            commands::generate_password_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}