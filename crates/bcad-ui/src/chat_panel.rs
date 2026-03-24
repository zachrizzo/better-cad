//! Beautiful chat panel with message bubbles, avatars, and streaming indicator.

use bcad_state::chat_state::UiChatMessage;
use bcad_state::{AppState, Command};
use egui::{Color32, CornerRadius, FontId, Margin, RichText, Stroke, Vec2};
use egui_commonmark::{CommonMarkCache, CommonMarkViewer};

use crate::theme;

std::thread_local! {
    static CHAT_INPUT: std::cell::RefCell<String> = std::cell::RefCell::new(String::new());
    static MD_CACHE: std::cell::RefCell<CommonMarkCache> = std::cell::RefCell::new(CommonMarkCache::default());
}

/// Render the chat panel. Returns commands.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let tc = theme::colors(state.ui.theme);
    let is_dark = matches!(state.ui.theme, bcad_state::ui_state::Theme::Dark);

    // ---- Header ----
    ui.add_space(4.0);
    ui.horizontal(|ui| {
        ui.label(RichText::new("\u{1F4AC}").size(18.0));
        ui.label(
            RichText::new("AI Assistant")
                .font(FontId::proportional(16.0))
                .strong()
                .color(tc.text_primary),
        );
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            let dot_color = if state.chat.is_streaming {
                Color32::from_rgb(59, 211, 83) // green = streaming
            } else {
                tc.text_muted
            };
            let dot_rect = ui.allocate_space(Vec2::new(8.0, 8.0));
            ui.painter().circle_filled(dot_rect.1.center(), 4.0, dot_color);
        });
    });
    ui.add_space(2.0);

    // ---- Plan mode toggle + New chat ----
    let active_chat = state
        .chat
        .active_chat_id
        .as_ref()
        .and_then(|id| state.chat.chats.get(id));

    let plan_mode = active_chat.map(|c| c.plan_mode).unwrap_or(true);

    ui.horizontal(|ui| {
        // Plan mode toggle button
        let plan_label = if plan_mode { "\u{1F4CB} Plan: ON" } else { "\u{26A1} Plan: OFF" };
        let plan_color = if plan_mode { tc.success } else { tc.text_muted };
        let plan_btn = egui::Button::new(
            RichText::new(plan_label).size(11.0).color(plan_color)
        )
        .fill(if plan_mode {
            Color32::from_rgba_unmultiplied(tc.success.r(), tc.success.g(), tc.success.b(), 25)
        } else {
            Color32::TRANSPARENT
        })
        .stroke(Stroke::new(0.5, plan_color))
        .corner_radius(CornerRadius::same(4));

        if ui.add(plan_btn).on_hover_text("Plan mode: AI describes what it will build before executing").clicked() {
            cmds.push(Command::SetPlanMode { enabled: !plan_mode });
        }

        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if ui.small_button("\u{1F5D1} Clear").clicked() {
                cmds.push(Command::ClearChat);
            }
        });
    });

    ui.add_space(2.0);
    ui.separator();
    ui.add_space(4.0);

    // ---- Layout: input pinned to bottom, messages fill the rest ----
    // Reserve space for the input area at the bottom first
    let total_available = ui.available_height();
    let input_height = 52.0; // input frame + padding
    let scroll_height = (total_available - input_height).max(80.0);

    egui::ScrollArea::vertical()
        .id_salt("chat_messages")
        .max_height(scroll_height)
        .stick_to_bottom(true)
        .show(ui, |ui| {
            ui.add_space(4.0);
            if let Some(chat) = active_chat {
                if chat.ui_messages.is_empty() {
                    ui.vertical_centered(|ui| {
                        ui.add_space(40.0);
                        ui.label(
                            RichText::new("\u{1F3D7}")
                                .size(32.0)
                                .color(tc.text_muted),
                        );
                        ui.add_space(8.0);
                        ui.label(
                            RichText::new("Start a conversation")
                                .size(14.0)
                                .color(tc.text_muted),
                        );
                    });
                } else {
                    for msg in &chat.ui_messages {
                        let msg_cmds = render_message(ui, msg, &tc, is_dark);
                        cmds.extend(msg_cmds);
                        ui.add_space(8.0);
                    }
                }
            } else {
                ui.colored_label(tc.text_muted, "No active chat.");
            }
            ui.add_space(4.0);
        });

    // ---- Input area ----
    ui.add_space(4.0);

    // Input container with subtle background
    let input_frame = egui::Frame::new()
        .fill(if is_dark {
            Color32::from_rgb(22, 27, 34)
        } else {
            Color32::from_rgb(246, 248, 250)
        })
        .inner_margin(Margin::same(6))
        .corner_radius(CornerRadius::same(8))
        .stroke(Stroke::new(
            1.0,
            if is_dark {
                Color32::from_rgb(48, 54, 61)
            } else {
                Color32::from_rgb(208, 215, 222)
            },
        ));

    input_frame.show(ui, |ui| {
        ui.horizontal(|ui| {
            let mut submitted = false;

            CHAT_INPUT.with(|input| {
                let mut buf = input.borrow_mut();
                let response = ui.add_sized(
                    [ui.available_width() - 56.0, 28.0],
                    egui::TextEdit::singleline(&mut *buf)
                        .hint_text("Describe what to build...")
                        .font(FontId::proportional(13.0))
                        .desired_width(f32::INFINITY),
                );

                if response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                    submitted = true;
                }

                // Styled send button
                let send_enabled = !buf.trim().is_empty();
                let btn_text = RichText::new("\u{27A4}") // ➤ arrow
                    .size(16.0)
                    .color(if send_enabled {
                        Color32::WHITE
                    } else {
                        tc.text_muted
                    });

                let btn_fill = if send_enabled {
                    tc.accent
                } else {
                    if is_dark {
                        Color32::from_rgb(33, 38, 45)
                    } else {
                        Color32::from_rgb(234, 238, 242)
                    }
                };

                let btn = egui::Button::new(btn_text)
                    .fill(btn_fill)
                    .corner_radius(CornerRadius::same(6))
                    .min_size(Vec2::new(40.0, 28.0));

                if ui.add(btn).clicked() {
                    submitted = true;
                }

                if submitted && !buf.trim().is_empty() {
                    cmds.push(Command::SendChatMessage {
                        content: buf.trim().to_string(),
                    });
                    buf.clear();
                }
            });
        });
    });

    cmds
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

fn render_message(
    ui: &mut egui::Ui,
    msg: &UiChatMessage,
    tc: &theme::ThemeColors,
    is_dark: bool,
) -> Vec<Command> {
    match msg {
        UiChatMessage::User { content, .. } => {
            render_user_bubble(ui, content, tc, is_dark);
            Vec::new()
        }
        UiChatMessage::Assistant {
            content, streaming, ..
        } => {
            render_assistant_bubble(ui, content, *streaming, tc, is_dark);
            // Show approve/revise buttons if content contains [PLAN READY]
            if content.contains("[PLAN READY]") && !*streaming {
                return render_plan_approval_buttons(ui, tc, is_dark);
            }
            Vec::new()
        }
        UiChatMessage::ToolCall {
            name, status, result, ..
        } => {
            render_tool_call(ui, name, status, result.as_deref(), tc, is_dark);
            Vec::new()
        }
        UiChatMessage::Plan {
            content, status, ..
        } => {
            render_plan(ui, content, status, tc, is_dark)
        }
    }
}

fn render_plan_approval_buttons(
    ui: &mut egui::Ui,
    tc: &theme::ThemeColors,
    is_dark: bool,
) -> Vec<Command> {
    let mut cmds = Vec::new();
    ui.add_space(4.0);
    ui.horizontal(|ui| {
        ui.add_space(36.0); // indent to match AI avatar

        let approve_btn = egui::Button::new(
            RichText::new("\u{2705} Approve Plan").size(13.0).color(Color32::WHITE)
        )
        .fill(tc.success)
        .corner_radius(CornerRadius::same(6))
        .min_size(Vec2::new(120.0, 28.0));

        if ui.add(approve_btn).clicked() {
            cmds.push(Command::SendChatMessage {
                content: "Approved. Go ahead and build it.".to_string(),
            });
        }

        ui.add_space(4.0);

        let revise_btn = egui::Button::new(
            RichText::new("\u{270F}\u{FE0F} Request Changes").size(13.0).color(tc.text_primary)
        )
        .fill(if is_dark {
            Color32::from_rgb(33, 38, 45)
        } else {
            Color32::from_rgb(234, 238, 242)
        })
        .stroke(Stroke::new(0.5, tc.border))
        .corner_radius(CornerRadius::same(6))
        .min_size(Vec2::new(130.0, 28.0));

        if ui.add(revise_btn).clicked() {
            // Focus the input — user can type their revision
            // For now, just provide a template
            CHAT_INPUT.with(|input| {
                let mut buf = input.borrow_mut();
                if buf.is_empty() {
                    *buf = "Please change: ".to_string();
                }
            });
        }
    });
    cmds
}

fn render_user_bubble(
    ui: &mut egui::Ui,
    content: &str,
    tc: &theme::ThemeColors,
    _is_dark: bool,
) {
    // Right-aligned user bubble
    ui.with_layout(egui::Layout::right_to_left(egui::Align::TOP), |ui| {
        // Avatar circle
        let (_, avatar_rect) = ui.allocate_space(Vec2::new(28.0, 28.0));
        ui.painter().circle_filled(
            avatar_rect.center(),
            13.0,
            tc.accent,
        );
        ui.painter().text(
            avatar_rect.center(),
            egui::Align2::CENTER_CENTER,
            "U",
            FontId::proportional(12.0),
            Color32::WHITE,
        );

        // Message bubble
        let bubble_color = Color32::from_rgba_premultiplied(
            tc.accent.r(),
            tc.accent.g(),
            tc.accent.b(),
            40,
        );
        let frame = egui::Frame::new()
            .fill(bubble_color)
            .inner_margin(Margin::symmetric(12, 8))
            .corner_radius(CornerRadius {
                nw: 12,
                ne: 2, // sharp corner on sender side
                sw: 12,
                se: 12,
            });

        frame.show(ui, |ui| {
            ui.set_max_width(ui.available_width() - 40.0);
            ui.label(
                RichText::new(content)
                    .size(13.0)
                    .color(tc.text_primary),
            );
        });
    });
}

fn render_assistant_bubble(
    ui: &mut egui::Ui,
    content: &str,
    streaming: bool,
    tc: &theme::ThemeColors,
    is_dark: bool,
) {
    // Use vertical layout so the bubble wraps properly
    ui.horizontal_top(|ui| {
        // AI avatar
        let (_, avatar_rect) = ui.allocate_space(Vec2::new(28.0, 28.0));
        let avatar_color = if is_dark {
            Color32::from_rgb(45, 50, 60)
        } else {
            Color32::from_rgb(220, 225, 235)
        };
        ui.painter().circle_filled(avatar_rect.center(), 13.0, avatar_color);
        ui.painter().text(
            avatar_rect.center(),
            egui::Align2::CENTER_CENTER,
            "\u{2728}",
            FontId::proportional(13.0),
            tc.accent,
        );

        // Message bubble — constrain width BEFORE creating the frame
        let max_bubble_width = (ui.available_width() - 8.0).max(100.0);

        ui.vertical(|ui| {
            ui.set_max_width(max_bubble_width);

            let bubble_color = if is_dark {
                Color32::from_rgb(22, 27, 34)
            } else {
                Color32::from_rgb(246, 248, 250)
            };

            let frame = egui::Frame::new()
                .fill(bubble_color)
                .inner_margin(Margin::symmetric(12, 8))
                .corner_radius(CornerRadius {
                    nw: 2,
                    ne: 12,
                    sw: 12,
                    se: 12,
                })
                .stroke(Stroke::new(
                    0.5,
                    if is_dark {
                        Color32::from_rgb(48, 54, 61)
                    } else {
                        Color32::from_rgb(208, 215, 222)
                    },
                ));

            frame.show(ui, |ui| {
                ui.set_max_width(max_bubble_width - 28.0);

                if content.is_empty() && streaming {
                    ui.horizontal(|ui| {
                        for i in 0..3 {
                            let t = ui.input(|i| i.time);
                            let phase = (t * 3.0 + i as f64 * 0.8).sin() * 0.5 + 0.5;
                            let alpha = (phase * 200.0 + 55.0) as u8;
                            let dot_color = Color32::from_rgba_unmultiplied(
                                tc.text_muted.r(), tc.text_muted.g(), tc.text_muted.b(), alpha,
                            );
                            let (_, dot_rect) = ui.allocate_space(Vec2::new(8.0, 16.0));
                            ui.painter().circle_filled(dot_rect.center(), 3.0, dot_color);
                            ui.ctx().request_repaint();
                        }
                    });
                } else {
                    render_markdown(ui, content, "msg");

                    if streaming {
                        ui.ctx().request_repaint();
                    }
                }
            });
        });
    });
}

fn render_tool_call(
    ui: &mut egui::Ui,
    name: &str,
    status: &bcad_state::chat_state::ToolCallStatus,
    result: Option<&str>,
    tc: &theme::ThemeColors,
    is_dark: bool,
) {
    let (icon, status_color) = match status {
        bcad_state::chat_state::ToolCallStatus::Pending => ("\u{23F3}", tc.accent), // hourglass
        bcad_state::chat_state::ToolCallStatus::Done => ("\u{2705}", tc.success),    // check
        bcad_state::chat_state::ToolCallStatus::Error => ("\u{274C}", tc.danger),    // X
    };

    ui.horizontal(|ui| {
        ui.add_space(36.0); // indent to match AI avatar
        let frame = egui::Frame::new()
            .fill(if is_dark {
                Color32::from_rgb(18, 22, 28)
            } else {
                Color32::from_rgb(240, 242, 245)
            })
            .inner_margin(Margin::symmetric(10, 6))
            .corner_radius(CornerRadius::same(6))
            .stroke(Stroke::new(0.5, status_color));

        frame.show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(RichText::new(icon).size(12.0));
                ui.label(
                    RichText::new(name)
                        .size(11.0)
                        .strong()
                        .color(tc.text_secondary),
                );
                if let Some(r) = result {
                    if r.len() < 60 {
                        ui.label(
                            RichText::new(format!("→ {r}"))
                                .size(11.0)
                                .color(tc.text_muted),
                        );
                    }
                }
            });
        });
    });
}

fn render_plan(
    ui: &mut egui::Ui,
    content: &str,
    status: &bcad_state::chat_state::PlanStatus,
    tc: &theme::ThemeColors,
    is_dark: bool,
) -> Vec<Command> {
    let mut cmds = Vec::new();
    let is_pending = matches!(status, bcad_state::chat_state::PlanStatus::Pending);

    let (icon, label) = match status {
        bcad_state::chat_state::PlanStatus::Pending => ("\u{1F4CB}", "Plan (awaiting approval)"),
        bcad_state::chat_state::PlanStatus::Approved => ("\u{2705}", "Plan (approved)"),
        bcad_state::chat_state::PlanStatus::Revised => ("\u{270F}\u{FE0F}", "Plan (revised)"),
    };

    ui.vertical(|ui| {
        ui.indent("plan_indent", |ui| {
            let frame = egui::Frame::new()
                .fill(if is_dark {
                    Color32::from_rgb(18, 25, 18)
                } else {
                    Color32::from_rgb(240, 248, 240)
                })
                .inner_margin(Margin::symmetric(12, 8))
                .corner_radius(CornerRadius::same(8))
                .stroke(Stroke::new(1.0, tc.success));

            frame.show(ui, |ui| {
                ui.set_max_width(ui.available_width() - 16.0);
                ui.label(
                    RichText::new(format!("{icon} {label}"))
                        .size(12.0)
                        .strong()
                        .color(tc.success),
                );
                ui.add_space(4.0);
                render_markdown(ui, content, "plan");

                // Approval buttons for pending plans
                if is_pending {
                    ui.add_space(8.0);
                    ui.separator();
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        let approve_btn = egui::Button::new(
                            RichText::new("\u{2705} Approve & Build").size(13.0).color(Color32::WHITE)
                        )
                        .fill(tc.success)
                        .corner_radius(CornerRadius::same(6))
                        .min_size(Vec2::new(130.0, 30.0));

                        if ui.add(approve_btn).clicked() {
                            cmds.push(Command::SendChatMessage {
                                content: "Approved. Go ahead and build it.".to_string(),
                            });
                        }

                        ui.add_space(6.0);

                        let revise_btn = egui::Button::new(
                            RichText::new("\u{270F}\u{FE0F} Request Changes").size(13.0).color(tc.text_primary)
                        )
                        .fill(if is_dark { Color32::from_rgb(33, 38, 45) } else { Color32::from_rgb(234, 238, 242) })
                        .stroke(Stroke::new(0.5, tc.border))
                        .corner_radius(CornerRadius::same(6))
                        .min_size(Vec2::new(140.0, 30.0));

                        if ui.add(revise_btn).clicked() {
                            CHAT_INPUT.with(|input| {
                                let mut buf = input.borrow_mut();
                                if buf.is_empty() {
                                    *buf = "Please change: ".to_string();
                                }
                            });
                        }
                    });
                }
            });
        });
    });

    cmds
}

// ---------------------------------------------------------------------------
// Full CommonMark rendering (headers, bold, italic, code blocks, lists,
// tables, links, images, blockquotes, strikethrough, etc.)
// ---------------------------------------------------------------------------

fn render_markdown(ui: &mut egui::Ui, text: &str, _msg_id: &str) {
    if text.is_empty() {
        return;
    }
    MD_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        CommonMarkViewer::new()
            .max_image_width(Some(256))
            .show(ui, &mut *cache, text);
    });
}
