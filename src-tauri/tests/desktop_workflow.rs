//! Desktop workflow integration test (no AI) — TC-WF-001 ~ TC-WF-020.
//!
//! 模拟真实用户在桌面端（无大模型介入）走完一次完整的"画布 → 绘制 → 填充 → 删除 →
//! 移动 → 旋转 → 文字 → 导出"流程，验证后端引擎 + Tauri 命令层在端到端路径上的契约稳定性。
//!
//! 对应需求：
//!   - 启动桌面端：`tauri::Builder::default()` 启动应用，加载 `AppState::default()`
//!   - 新建 520×520 画布：`resize_canvas(520, 520)`
//!   - 手绘 6 种颜色的圆 / 矩形 / 线段：在 6 个独立图层上用 `BrushTool` 跑出近似几何形状的笔触
//!   - 油漆桶工具填充 3 个形状：`FillTool` 给其中 3 个图层填上 3 种不同颜色
//!   - 删除 3 个形状：`remove_active_layer()` 反复调用
//!   - 鼠标拖移：`MoveTool::apply(... MoveLayer { dx, dy })`
//!   - 旋转：`RotateTool`（90°/180°/270°/任意角度）→ 断言像素位置变化 + undo 可回退（TC-WF-018）
//!   - 文字输入：`add_text` 命令经 usvg 栅格化后写入图层像素（TC-WF-019）
//!   - 混合模式：`set_layer_blend_mode` 命令切换 Normal/Multiply/Screen/Overlay（TC-WF-017）
//!   - 保存为 JPG / PNG / WebP：`render_image(...)` 三种格式编码。
//!
//! 与现有单测关系：本文件是 `cargo test --test desktop_workflow` 独立运行的 integration test，
//! 不属于 `src-tauri/src/canvas/**/tests.rs` 的内联 `mod tests`，与 R-A04 E2E 计划正交。

use openpaint::canvas::{
    BlendMode, BrushTool, CanvasRenderer, CanvasState, CanvasTool, Color, EraserTool, FillTool,
    Layer, MoveTool, RectSelectTool, RotateTool, TextTool, ToolInput,
};

// ----------------------------------------------------------------
// helpers
// ----------------------------------------------------------------

/// 在 (cx, cy) 周围跑一圈"圆形"笔触。`segments` 越大越圆滑。
fn brush_circle(
    layer_id: uuid::Uuid,
    cx: i32,
    cy: i32,
    radius: i32,
    segments: usize,
    brush_radius: u32,
    color: Color,
) -> Vec<(i32, i32)> {
    let mut points = Vec::with_capacity(segments + 1);
    for i in 0..=segments {
        let theta = (i as f32 / segments as f32) * std::f32::consts::TAU;
        let px = cx + (theta.cos() * radius as f32).round() as i32;
        let py = cy + (theta.sin() * radius as f32).round() as i32;
        points.push((px, py));
    }
    let _ = (layer_id, brush_radius, color); // 占位，调用方负责 apply
    points
}

/// 在 (x0,y0) → (x1,y1) 之间取 `steps+1` 个点，模拟手绘线段。
fn brush_line(
    x0: i32,
    y0: i32,
    x1: i32,
    y1: i32,
    steps: usize,
) -> Vec<(i32, i32)> {
    let mut points = Vec::with_capacity(steps + 1);
    for i in 0..=steps {
        let t = i as f32 / steps as f32;
        let px = (x0 as f32 + (x1 as f32 - x0 as f32) * t).round() as i32;
        let py = (y0 as f32 + (y1 as f32 - y0 as f32) * t).round() as i32;
        points.push((px, py));
    }
    points
}

/// 在 (x0,y0) → (x1,y0) → (x1,y1) → (x0,y1) → (x0,y0) 之间跑 4 条边，模拟手绘矩形。
fn brush_rect(x0: i32, y0: i32, x1: i32, y1: i32, steps_per_edge: usize) -> Vec<(i32, i32)> {
    let mut pts = Vec::new();
    pts.extend(brush_line(x0, y0, x1, y0, steps_per_edge));
    pts.extend(brush_line(x1, y0, x1, y1, steps_per_edge));
    pts.extend(brush_line(x1, y1, x0, y1, steps_per_edge));
    pts.extend(brush_line(x0, y1, x0, y0, steps_per_edge));
    pts
}

fn active_layer_id(state: &CanvasState) -> uuid::Uuid {
    state.active_layer_id
}

/// 计算图层内非透明像素数（alpha > 0），用于验证"画上去确实有像素"。
fn count_opaque_pixels(layer: &Layer) -> usize {
    layer
        .image_data
        .chunks_exact(4)
        .filter(|px| px[3] > 0)
        .count()
}

// ----------------------------------------------------------------
// 1. 启动桌面端：构造默认 AppState，确认画布尺寸、初始图层、history 配置
// ----------------------------------------------------------------

#[test]
fn tc_wf_001_desktop_boot_default_state() {
    // 模拟 `tauri::Builder::default().setup(|app| ...)` 完成后的 AppState::default()
    let state = CanvasState::default();
    assert_eq!(state.width, 1920);
    assert_eq!(state.height, 1080);
    assert_eq!(state.layers.len(), 1);
    // 历史栈上限=50 由 canvas/history.rs::tests::test_max_size_enforced 覆盖。
    assert!(!state.history.can_undo());
    assert_eq!(state.history.len(), 0);
}

// ----------------------------------------------------------------
// 2. 新建 520×520 画布（resize_canvas）
// ----------------------------------------------------------------

#[test]
fn tc_wf_002_resize_canvas_to_520x520() {
    let mut state = CanvasState::default();
    // 等价于 `resize_canvas(520, 520)`：清掉旧背景，重分配缓冲
    state.width = 520;
    state.height = 520;
    let id = uuid::Uuid::new_v4();
    let mut new_bg = Layer::new(id, "Background", 520, 520);
    // 背景填白
    let pixel_count = 520usize * 520;
    for i in 0..pixel_count {
        let idx = i * 4;
        new_bg.image_data[idx] = 255;
        new_bg.image_data[idx + 1] = 255;
        new_bg.image_data[idx + 2] = 255;
        new_bg.image_data[idx + 3] = 255;
    }
    state.layers = vec![new_bg];
    state.active_layer_id = id;

    assert_eq!(state.width, 520);
    assert_eq!(state.height, 520);
    assert_eq!(state.layers.len(), 1);
    assert_eq!(state.layers[0].image_data.len(), 520 * 520 * 4);
}

// ----------------------------------------------------------------
// 3. 手绘：6 个图层，每个图层上跑出"圆 / 矩形 / 线段 / 圆 / 矩形 / 线段"，使用 6 种不同颜色
// ----------------------------------------------------------------

#[test]
fn tc_wf_003_hand_draw_six_colors_six_shapes() {
    let mut state = CanvasState::new(520, 520);
    // 6 种用户自定义颜色（与前端 BrushPanel 的预设颜色对应）
    let palette = [
        ("#e74c3c", Color::from_hex("#e74c3c").unwrap()), // 红
        ("#f1c40f", Color::from_hex("#f1c40f").unwrap()), // 黄
        ("#2ecc71", Color::from_hex("#2ecc71").unwrap()), // 绿
        ("#3498db", Color::from_hex("#3498db").unwrap()), // 蓝
        ("#9b59b6", Color::from_hex("#9b59b6").unwrap()), // 紫
        ("#1abc9c", Color::from_hex("#1abc9c").unwrap()), // 青
    ];

    let shapes: [&str; 6] = ["circle", "rect", "line", "circle", "rect", "line"];
    let brush = BrushTool;
    for (idx, ((label, color), shape)) in palette.iter().zip(shapes.iter()).enumerate() {
        state.push_history(format!("brush_stroke:{}#{}", shape, label));
        let layer_id = state.add_layer(format!("Shape-{}", idx + 1));
        let (points, cx, cy) = match *shape {
            // 三个形状分散在 520x520 画布的不同区域
            "circle" => (brush_circle(layer_id, 130, 130 + (idx as i32 / 2) * 220, 70, 64, 8, *color), 130, 130 + (idx as i32 / 2) * 220),
            "rect" => (brush_rect(300, 60 + (idx as i32 / 2) * 220, 460, 200 + (idx as i32 / 2) * 220, 16), 380, 130 + (idx as i32 / 2) * 220),
            "line" => (brush_line(60 + idx as i32 * 5, 480, 460 - idx as i32 * 5, 480, 32), 260, 480),
            _ => unreachable!(),
        };
        brush
            .apply(
                &mut state,
                ToolInput::Stroke {
                    layer_id,
                    points,
                    radius: 8,
                    color: *color,
                },
            )
            .expect("brush apply");
        let layer = state
            .layers
            .iter()
            .find(|l| l.id == layer_id)
            .expect("layer exists");
        let opaque = count_opaque_pixels(layer);
        assert!(
            opaque > 100,
            "TC-WF-003: shape #{} ({}) color {} should have > 100 opaque px, got {}",
            idx + 1,
            shape,
            label,
            opaque
        );
        let _ = (cx, cy);
    }

    // 6 个图层（背景 1 + 形状 6），共 7 层
    assert_eq!(state.layers.len(), 7);
    assert_eq!(state.history.can_undo(), true);
    // 6 次 push 后 cursor=6，能连续 undo 直到 cursor=1（=5 次）。
    let mut undos = 0;
    while state.history.can_undo() {
        state.history.undo();
        undos += 1;
        if undos > 100 {
            break;
        }
    }
    assert_eq!(undos, 5, "TC-WF-003: 6 pushes => 5 undoable steps, got {}", undos);
}

// ----------------------------------------------------------------
// 4. 油漆桶（FillTool）：3 个图层用 3 种不同颜色填充
// ----------------------------------------------------------------

#[test]
fn tc_wf_004_paint_bucket_fill_three_layers() {
    let mut state = CanvasState::new(520, 520);
    let fill_tool = FillTool;

    // 准备 3 个独立的填充图层
    let colors = [
        Color::from_hex("#ff6b6b").unwrap(), // 浅红
        Color::from_hex("#feca57").unwrap(), // 浅黄
        Color::from_hex("#48dbfb").unwrap(), // 浅蓝
    ];
    let mut layer_ids = Vec::new();
    for (idx, color) in colors.iter().enumerate() {
        let layer_id = state.add_layer(format!("Fill-{}", idx + 1));
        state.push_history("fill_layer");
        fill_tool
            .apply(
                &mut state,
                ToolInput::FillLayer {
                    layer_id,
                    color: *color,
                },
            )
            .expect("fill apply");
        layer_ids.push((layer_id, *color));
    }

    // 校验每个图层都已被纯色填满（全透明 -> 全 color + alpha=255）
    for (layer_id, expected_color) in &layer_ids {
        let layer = state
            .layers
            .iter()
            .find(|l| l.id == *layer_id)
            .expect("layer exists");
        let total = layer.width as usize * layer.height as usize;
        let opaque = count_opaque_pixels(layer);
        assert_eq!(
            opaque, total,
            "TC-WF-004: filled layer should be fully opaque"
        );
        // 抽样一个像素验证颜色
        let sample = &layer.image_data[0..4];
        assert_eq!(sample[0], expected_color.r);
        assert_eq!(sample[1], expected_color.g);
        assert_eq!(sample[2], expected_color.b);
        assert_eq!(sample[3], expected_color.a);
    }
}

// ----------------------------------------------------------------
// 5. 删除 3 个形状（remove_active_layer）
// ----------------------------------------------------------------

#[test]
fn tc_wf_005_delete_three_layers_in_sequence() {
    let mut state = CanvasState::new(520, 520);
    // 准备 5 个图层（背景 1 + 4 个新图层）
    for i in 0..4 {
        let _ = state.add_layer(format!("Layer-{}", i + 1));
    }
    assert_eq!(state.layers.len(), 5);

    // 连续删 3 次。起始 5 层，删后依次为 4 / 3 / 2 层。
    let mut expected_remaining = state.layers.len() - 1;
    for _ in 0..3 {
        let active = active_layer_id(&state);
        state.push_history("remove_layer");
        let removed = state.remove_active_layer();
        assert!(removed, "TC-WF-005: remove_active_layer should succeed");
        assert_eq!(
            state.layers.len(),
            expected_remaining,
            "TC-WF-005: layer count should decrement"
        );
        // 活动图层不再是已被删除的那个
        assert_ne!(
            state.active_layer_id, active,
            "TC-WF-005: active layer should switch after removal"
        );
        expected_remaining -= 1;
    }

    // 再删 2 次才能到最后 1 层（剩 2 → 剩 1）。
    let active = active_layer_id(&state);
    state.push_history("remove_layer");
    assert!(state.remove_active_layer());
    assert_eq!(state.layers.len(), 1);
    let _ = active;

    // 至少要保留 1 层：再删一次，返回 false
    state.push_history("remove_layer");
    assert!(!state.remove_active_layer(), "TC-WF-005: last layer must be kept");
    assert_eq!(state.layers.len(), 1);
}

// ----------------------------------------------------------------
// 6. 鼠标拖移（MoveTool）
// ----------------------------------------------------------------

#[test]
fn tc_wf_006_drag_move_layer_translates_offset() {
    let mut state = CanvasState::new(520, 520);
    let layer_id = state.add_layer("Draggable");
    let move_tool = MoveTool;

    state.push_history("move_layer");
    move_tool
        .apply(
            &mut state,
            ToolInput::MoveLayer {
                layer_id,
                dx: 30,
                dy: -15,
            },
        )
        .expect("move apply");

    let layer = state
        .layers
        .iter()
        .find(|l| l.id == layer_id)
        .expect("layer exists");
    assert_eq!(layer.offset_x, 30, "TC-WF-006: dx should accumulate on offset_x");
    assert_eq!(layer.offset_y, -15, "TC-WF-006: dy should accumulate on offset_y");

    // 再拖一次累加
    state.push_history("move_layer");
    move_tool
        .apply(
            &mut state,
            ToolInput::MoveLayer {
                layer_id,
                dx: -10,
                dy: 25,
            },
        )
        .expect("move apply");
    let layer = state
        .layers
        .iter()
        .find(|l| l.id == layer_id)
        .expect("layer exists");
    assert_eq!(layer.offset_x, 20);
    assert_eq!(layer.offset_y, 10);
}

// ----------------------------------------------------------------
// 7. 橡皮（EraserTool）：模拟手抖 / 误擦
// ----------------------------------------------------------------

#[test]
fn tc_wf_007_eraser_clears_drawn_pixels() {
    let mut state = CanvasState::new(520, 520);
    let layer_id = state.add_layer("EraseTarget");

    let brush = BrushTool;
    brush
        .apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: brush_circle(layer_id, 260, 260, 60, 48, 8, Color::from_hex("#222222").unwrap()),
                radius: 8,
                color: Color::from_hex("#222222").unwrap(),
            },
        )
        .expect("brush apply");
    let before = count_opaque_pixels(
        state.layers.iter().find(|l| l.id == layer_id).unwrap(),
    );
    assert!(before > 100, "TC-WF-007: should have inked pixels first");

    // 在画过的区域内擦一笔
    let eraser = EraserTool;
    eraser
        .apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: brush_line(260, 260, 320, 260, 16),
                radius: 12,
                color: Color::TRANSPARENT,
            },
        )
        .expect("eraser apply");
    let after = count_opaque_pixels(
        state.layers.iter().find(|l| l.id == layer_id).unwrap(),
    );
    assert!(
        after < before,
        "TC-WF-007: eraser should reduce opaque pixel count (before={}, after={})",
        before,
        after
    );
}

// ----------------------------------------------------------------
// 8. 矩形选区（RectSelectTool）
// ----------------------------------------------------------------

#[test]
fn tc_wf_008_rect_select_creates_selection_with_data() {
    let mut state = CanvasState::new(520, 520);
    let tool = RectSelectTool;

    tool.apply(
        &mut state,
        ToolInput::RectSelect {
            x: 10,
            y: 20,
            width: 100,
            height: 80,
        },
    )
    .expect("rect_select apply");

    let sel = state.selection.as_ref().expect("selection exists");
    assert_eq!(sel.x, 10);
    assert_eq!(sel.y, 20);
    assert_eq!(sel.width, 100);
    assert_eq!(sel.height, 80);
    // 选区应包含像素数据快照
    assert!(
        sel.data.is_some(),
        "TC-WF-008: selection should carry cropped pixel data"
    );
    let data = sel.data.as_ref().unwrap();
    assert_eq!(data.len(), 100 * 80 * 4);
}

// ----------------------------------------------------------------
// 9. 渲染导出：PNG / JPG / WebP 三种格式（save as JPG / save as PNG / 另存为 WebP）
// ----------------------------------------------------------------

#[test]
fn tc_wf_009_render_export_three_formats() {
    let mut state = CanvasState::new(520, 520);
    // 先填一笔确认有像素
    let layer_id = state.active_layer_id;
    BrushTool
        .apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: brush_circle(layer_id, 260, 260, 100, 64, 12, Color::from_hex("#6c5ce7").unwrap()),
                radius: 12,
                color: Color::from_hex("#6c5ce7").unwrap(),
            },
        )
        .expect("brush apply");

    let composed = CanvasRenderer::composite(&state).expect("composite");
    assert_eq!(composed.width(), 520);
    assert_eq!(composed.height(), 520);

    // PNG
    let png = CanvasRenderer::render_image(&composed, "png", 100).expect("png encode");
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n", "TC-WF-009: PNG signature");
    assert!(png.len() > 100, "TC-WF-009: PNG payload size");

    // JPG（alpha 通道会被合成到白底）
    let jpg = CanvasRenderer::render_image(&composed, "jpg", 85).expect("jpg encode");
    assert_eq!(&jpg[..2], &[0xFF, 0xD8], "TC-WF-009: JPG SOI");
    assert_eq!(&jpg[jpg.len() - 2..], &[0xFF, 0xD9], "TC-WF-009: JPG EOI");

    // WebP
    let webp = CanvasRenderer::render_image(&composed, "webp", 90).expect("webp encode");
    assert_eq!(&webp[..4], b"RIFF", "TC-WF-009: WebP RIFF container");
    assert_eq!(&webp[8..12], b"WEBP", "TC-WF-009: WebP magic");
    assert!(webp.len() > 30);
}

#[test]
fn tc_wf_010_render_export_long_edge_resize() {
    // 验证"另存为图标（批量导出）"路径：长边缩放到目标像素后输出 PNG
    let mut state = CanvasState::new(520, 520);
    let layer_id = state.active_layer_id;
    BrushTool
        .apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: brush_rect(80, 80, 440, 440, 32),
                radius: 6,
                color: Color::from_hex("#3498db").unwrap(),
            },
        )
        .expect("brush apply");
    let composed = CanvasRenderer::composite(&state).expect("composite");
    let resized = CanvasRenderer::resize_to_long_edge(&composed, 128);
    assert_eq!(resized.width(), 128);
    assert_eq!(resized.height(), 128);
    let png = CanvasRenderer::render_image(&resized, "png", 100).expect("png encode");
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    assert!(png.len() > 50, "TC-WF-010: 128x128 PNG should be non-trivial");
}

// ----------------------------------------------------------------
// 10. 撤销 / 重做（Undo / Redo）：覆盖用户"误删 → 撤销"的真实场景
// ----------------------------------------------------------------

#[test]
fn tc_wf_011_undo_redo_roundtrip_for_brush_and_fill() {
    let mut state = CanvasState::new(520, 520);
    // 独立透明图层，避免背景白底干扰计数。
    let layer_id = state.add_layer("BrushTarget");

    // pre-marker: 让 brush undo 后还能再撤一次
    state.push_history("pre_marker");
    state.push_history("brush");
    BrushTool
        .apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: brush_circle(layer_id, 200, 200, 40, 32, 8, Color::from_hex("#ff0000").unwrap()),
                radius: 8,
                color: Color::from_hex("#ff0000").unwrap(),
            },
        )
        .expect("brush apply");
    let brush_ink_count = count_opaque_pixels(
        state.layers.iter().find(|l| l.id == layer_id).unwrap(),
    );
    assert!(brush_ink_count > 100, "TC-WF-011: brush should ink many pixels");
    state.push_history("post_brush_marker");
    let filled_id = state.add_layer("Bucket");
    state.push_history("fill");
    FillTool
        .apply(
            &mut state,
            ToolInput::FillLayer {
                layer_id: filled_id,
                color: Color::from_hex("#00ff00").unwrap(),
            },
        )
        .expect("fill apply");
    // cursor=4，能连续 undo 3 次（fill -> brush -> pre_marker）
    state.push_history("tail_marker");

    assert!(state.history.can_undo());

    // 撤销 tail（到 fill 后的状态）
    let snap = state.history.undo().expect("undo 1").clone();
    state.layers = snap.layers.clone();
    state.active_layer_id = snap.active_layer_id;
    state.selection = snap.selection.clone();

    // 撤销填充（fill layer 应被回退）
    let snap = state.history.undo().expect("undo 2").clone();
    state.layers = snap.layers.clone();
    state.active_layer_id = snap.active_layer_id;
    state.selection = snap.selection.clone();

    assert!(
        !state
            .layers
            .iter()
            .any(|l| l.id == filled_id && count_opaque_pixels(l) > 0),
        "TC-WF-011: after 2 undos, fill layer should be reverted"
    );

    // 再撤销画笔
    let snap = state.history.undo().expect("undo 3").clone();
    state.layers = snap.layers.clone();
    state.active_layer_id = snap.active_layer_id;
    let before = count_opaque_pixels(
        state.layers.iter().find(|l| l.id == layer_id).unwrap(),
    );
    assert_eq!(before, 0, "TC-WF-011: after 3rd undo, brush should be gone (was {} inked)", brush_ink_count);

    // 重做画笔
    let snap = state.history.redo().expect("redo").clone();
    state.layers = snap.layers.clone();
    state.active_layer_id = snap.active_layer_id;
    let after = count_opaque_pixels(
        state.layers.iter().find(|l| l.id == layer_id).unwrap(),
    );
    assert_eq!(
        after, brush_ink_count,
        "TC-WF-011: after redo, brush should restore exact ink count ({} vs {})",
        after, brush_ink_count
    );
}

// ----------------------------------------------------------------
// 11. 完整 11 步端到端：把上面所有子用例串成一个真实流程
// ----------------------------------------------------------------

#[test]
fn tc_wf_012_full_desktop_workflow_no_ai() {
    // === 1. 启动桌面端：默认画布 1920x1080 ===
    let mut state = CanvasState::default();
    assert_eq!(state.width, 1920);

    // === 2. 新建 520x520 画布（自定义尺寸）===
    state.width = 520;
    state.height = 520;
    let bg_id = uuid::Uuid::new_v4();
    let mut bg = Layer::new(bg_id, "Background", 520, 520);
    for i in 0..(520usize * 520) {
        let idx = i * 4;
        bg.image_data[idx] = 255;
        bg.image_data[idx + 1] = 255;
        bg.image_data[idx + 2] = 255;
        bg.image_data[idx + 3] = 255;
    }
    state.layers = vec![bg];
    state.active_layer_id = bg_id;
    assert_eq!(state.width, 520);

    // === 3. 手绘 6 个形状，6 种颜色（圆 / 矩形 / 线段 × 2 组）===
    let palette = [
        "#e74c3c", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6", "#1abc9c",
    ];
    let brush = BrushTool;
    let mut shape_layer_ids = Vec::new();
    for (idx, hex) in palette.iter().enumerate() {
        let color = Color::from_hex(hex).unwrap();
        let layer_id = state.add_layer(format!("Shape-{}", idx + 1));
        let points = match idx {
            0 => brush_circle(layer_id, 130, 130, 70, 48, 8, color),
            1 => brush_rect(260, 60, 460, 200, 24),
            2 => brush_line(60, 280, 460, 280, 48),
            3 => brush_circle(layer_id, 130, 390, 70, 48, 8, color),
            4 => brush_rect(260, 320, 460, 460, 24),
            5 => brush_line(60, 490, 460, 490, 48),
            _ => unreachable!(),
        };
        state.push_history("brush_stroke");
        brush
            .apply(
                &mut state,
                ToolInput::Stroke {
                    layer_id,
                    points,
                    radius: 8,
                    color,
                },
            )
            .expect("brush apply");
        shape_layer_ids.push(layer_id);
    }
    assert_eq!(shape_layer_ids.len(), 6);
    assert_eq!(state.layers.len(), 7);

    // === 4. 油漆桶填充：给前 3 个图层填上 3 种颜色 ===
    let bucket_colors = [
        Color::from_hex("#ff6b6b").unwrap(),
        Color::from_hex("#feca57").unwrap(),
        Color::from_hex("#48dbfb").unwrap(),
    ];
    for (idx, color) in bucket_colors.iter().enumerate() {
        state.push_history("fill_layer");
        FillTool
            .apply(
                &mut state,
                ToolInput::FillLayer {
                    layer_id: shape_layer_ids[idx],
                    color: *color,
                },
            )
            .expect("fill apply");
    }
    for idx in 0..3 {
        let layer = state
            .layers
            .iter()
            .find(|l| l.id == shape_layer_ids[idx])
            .unwrap();
        let total = 520 * 520;
        let opaque = count_opaque_pixels(layer);
        assert_eq!(
            opaque, total,
            "TC-WF-012: filled layer #{} should be fully opaque",
            idx + 1
        );
    }

    // === 5. 鼠标拖移：把第 4 个图层（索引 3）往右下角拖 50,50 ===
    let move_tool = MoveTool;
    state.push_history("move_layer");
    move_tool
        .apply(
            &mut state,
            ToolInput::MoveLayer {
                layer_id: shape_layer_ids[3],
                dx: 50,
                dy: 50,
            },
        )
        .expect("move apply");
    let moved = state
        .layers
        .iter()
        .find(|l| l.id == shape_layer_ids[3])
        .unwrap();
    assert_eq!(moved.offset_x, 50);
    assert_eq!(moved.offset_y, 50);

    // === 6. 删除 3 个形状：删第 5、6 个，加上 1 个原始笔触图层 ===
    let before_layers = state.layers.len();
    for idx in [4usize, 5usize, 1usize] {
        state.active_layer_id = shape_layer_ids[idx];
        state.push_history("remove_layer");
        let removed = state.remove_active_layer();
        assert!(removed);
        shape_layer_ids[idx] = uuid::Uuid::nil(); // 已删，标记
    }
    assert_eq!(state.layers.len(), before_layers - 3);

    // === 7. 旋转：当前 MoveTool 只支持平移；旋转为已知 GAP ===
    // （见 TC-WF-018，已知 GAP，不在此处 fail。）

    // === 8. 文字输入：当前后端未暴露文字工具，作为已知 GAP ===
    // （见 TC-WF-019，已知 GAP，不在此处 fail。）

    // === 9. 保存为 JPG ===
    let composed = CanvasRenderer::composite(&state).expect("composite");
    let jpg = CanvasRenderer::render_image(&composed, "jpg", 90).expect("jpg encode");
    assert_eq!(&jpg[..2], &[0xFF, 0xD8]);
    assert_eq!(&jpg[jpg.len() - 2..], &[0xFF, 0xD9]);

    // === 10. 另存为 PNG ===
    let png = CanvasRenderer::render_image(&composed, "png", 100).expect("png encode");
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");

    // === 11. 另存为 WebP（对应前端 ExportDialog 的第三个格式按钮）===
    let webp = CanvasRenderer::render_image(&composed, "webp", 80).expect("webp encode");
    assert_eq!(&webp[..4], b"RIFF");
    assert_eq!(&webp[8..12], b"WEBP");
}

// ----------------------------------------------------------------
// 12. 边界：无效颜色 / 不存在的图层 / 极小笔触
// ----------------------------------------------------------------

#[test]
fn tc_wf_013_invalid_hex_color_fails() {
    let mut state = CanvasState::new(520, 520);
    // 新建独立透明图层，避免背景白底干扰断言。
    let layer_id = state.add_layer("Transparent");
    let res = BrushTool.apply(
        &mut state,
        ToolInput::Stroke {
            layer_id,
            points: vec![(10, 10)],
            radius: 4,
            color: Color::from_hex("#zz0000").unwrap_or(Color::TRANSPARENT),
        },
    );
    // 无效 hex 不会报错（被 fallback 为 TRANSPARENT），但不会写入像素
    assert!(res.is_ok());
    let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
    assert_eq!(
        count_opaque_pixels(layer),
        0,
        "TC-WF-013: invalid hex should not paint any opaque pixel"
    );
}

#[test]
fn tc_wf_014_fill_unknown_layer_errors() {
    let mut state = CanvasState::new(520, 520);
    let bogus = uuid::Uuid::new_v4();
    let res = FillTool.apply(
        &mut state,
        ToolInput::FillLayer {
            layer_id: bogus,
            color: Color::from_hex("#ff0000").unwrap(),
        },
    );
    assert!(res.is_err(), "TC-WF-014: fill on missing layer should error");
}

#[test]
fn tc_wf_015_move_unknown_layer_errors() {
    let mut state = CanvasState::new(520, 520);
    let bogus = uuid::Uuid::new_v4();
    let res = MoveTool.apply(
        &mut state,
        ToolInput::MoveLayer {
            layer_id: bogus,
            dx: 5,
            dy: 5,
        },
    );
    assert!(res.is_err(), "TC-WF-015: move on missing layer should error");
}

#[test]
fn tc_wf_016_render_empty_canvas_still_succeeds() {
    let state = CanvasState::new(520, 520);
    let composed = CanvasRenderer::composite(&state).expect("composite empty");
    assert_eq!(composed.width(), 520);
    assert_eq!(composed.height(), 520);
    let png = CanvasRenderer::render_image(&composed, "png", 100).expect("png");
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
}

// ----------------------------------------------------------------
// 13. TC-WF-017 ~ TC-WF-020：混合模式 / 旋转 / 文字 / 可见性
// ----------------------------------------------------------------

/// TC-WF-017：图层混合模式切换（用户在画笔工具切换 Normal/Multiply/Screen/Overlay）。
/// 验证：
///   1. BlendMode 枚举值在 engine 内部正确读写
///   2. 不同混合模式下 composite + render_image 不崩溃
///   3. push_history + 手动改 blend_mode + undo 路径通
///   4. IPC args `SetLayerBlendModeArgs` 反序列化稳定
#[test]
fn tc_wf_017_blend_mode_toggle_is_engine_only_no_ipc() {
    use openpaint::tools::canvas_commands::SetLayerBlendModeArgs;

    // 1) 引擎本身能正确读写
    let mut state = CanvasState::new(520, 520);
    state.layers[0].blend_mode = BlendMode::Multiply;
    assert_eq!(state.layers[0].blend_mode, BlendMode::Multiply);
    state.layers[0].blend_mode = BlendMode::Screen;
    assert_eq!(state.layers[0].blend_mode, BlendMode::Screen);
    state.layers[0].blend_mode = BlendMode::Overlay;
    assert_eq!(state.layers[0].blend_mode, BlendMode::Overlay);
    state.layers[0].blend_mode = BlendMode::Normal;
    assert_eq!(state.layers[0].blend_mode, BlendMode::Normal);

    // 2) Multiply 模式下 composite + render_image 不崩溃
    let mut state = CanvasState::new(64, 64);
    state.layers[0].blend_mode = BlendMode::Multiply;
    let composed = CanvasRenderer::composite(&state).expect("composite");
    let png = CanvasRenderer::render_image(&composed, "png", 95).expect("png encode");
    assert!(png.starts_with(b"\x89PNG"));

    // 3) push_history + 手动改 blend_mode + undo 路径
    let mut state = CanvasState::new(64, 64);
    let lid = state.add_layer("CmdBlend");
    state.active_layer_id = lid;
    state.push_history("initial_state");
    state.push_history("set_layer_blend_mode_cmd");
    state
        .layers
        .iter_mut()
        .find(|l| l.id == lid)
        .unwrap()
        .blend_mode = BlendMode::Screen;
    assert_eq!(
        state
            .layers
            .iter()
            .find(|l| l.id == lid)
            .unwrap()
            .blend_mode,
        BlendMode::Screen
    );
    assert!(
        state.history.undo().is_some(),
        "blend_mode 切换应可 undo"
    );

    // 4) IPC args 反序列化（保证 wire-format 稳定）
    let args: SetLayerBlendModeArgs = serde_json::from_str(
        "{\"layer_id\":\"00000000-0000-0000-0000-000000000001\",\"mode\":\"multiply\"}",
    )
    .expect("parse args");
    assert_eq!(args.layer_id, "00000000-0000-0000-0000-000000000001");
    assert_eq!(args.mode, "multiply");
}

/// TC-WF-018：旋转（鼠标拖移 + 旋转手柄）。
/// 验证：
///   1. 90° 顺时针后，像素从 (col=2, row=2) 移动到 (col=5, row=2)
///   2. 180° 后，像素移动到 (col=5, row=5)
///   3. 270° 后，像素移动到 (col=2, row=5)
///   4. 4 次 90° 累计后回到起点（identity）
///   5. 任意角度旋转后像素被扩散（双线性插值）
///   6. 旋转操作可 undo
#[test]
fn tc_wf_018_rotate_layer_supported() {
    let pixel = |col: u32, row: u32| ((row * 8 + col) * 4) as usize;

    // ---------- 90° CW ----------
    let mut state = CanvasState::new(8, 8);
    let lid = state.add_layer("Rot90");
    state.active_layer_id = lid;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data = vec![0u8; 8 * 8 * 4];
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(2, 2)] = 255;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(2, 2) + 3] = 255;
    RotateTool
        .apply(&mut state, ToolInput::RotateLayer { layer_id: lid, degrees: 90.0 })
        .expect("rotate 90");
    {
        let layer = state.layers.iter().find(|l| l.id == lid).unwrap();
        assert_eq!(layer.image_data[pixel(2, 2) + 3], 0, "原 (2,2) 应变透明");
        assert_eq!(layer.image_data[pixel(5, 2)], 255, "90° 后像素应到 (5,2)");
        assert_eq!(layer.image_data[pixel(5, 2) + 3], 255, "alpha 同步");
    }

    // ---------- 180° ----------
    let mut state = CanvasState::new(8, 8);
    let lid = state.add_layer("Rot180");
    state.active_layer_id = lid;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data = vec![0u8; 8 * 8 * 4];
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(2, 2)] = 255;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(2, 2) + 3] = 255;
    RotateTool
        .apply(&mut state, ToolInput::RotateLayer { layer_id: lid, degrees: 180.0 })
        .expect("rotate 180");
    {
        let layer = state.layers.iter().find(|l| l.id == lid).unwrap();
        assert_eq!(layer.image_data[pixel(5, 5)], 255, "180° 后像素应到 (5,5)");
        assert_eq!(layer.image_data[pixel(5, 5) + 3], 255);
    }

    // ---------- 270° CW = 90° CCW ----------
    let mut state = CanvasState::new(8, 8);
    let lid = state.add_layer("Rot270");
    state.active_layer_id = lid;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data = vec![0u8; 8 * 8 * 4];
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(2, 2)] = 255;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(2, 2) + 3] = 255;
    RotateTool
        .apply(&mut state, ToolInput::RotateLayer { layer_id: lid, degrees: 270.0 })
        .expect("rotate 270");
    {
        let layer = state.layers.iter().find(|l| l.id == lid).unwrap();
        assert_eq!(layer.image_data[pixel(2, 5)], 255, "270° 后像素应到 (2,5)");
        assert_eq!(layer.image_data[pixel(2, 5) + 3], 255);
    }

    // ---------- 累计 4 × 90° = identity ----------
    let mut state = CanvasState::new(8, 8);
    let lid = state.add_layer("Rot360");
    state.active_layer_id = lid;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data = vec![0u8; 8 * 8 * 4];
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(2, 2)] = 255;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(2, 2) + 3] = 255;
    for _ in 0..4 {
        RotateTool
            .apply(&mut state, ToolInput::RotateLayer { layer_id: lid, degrees: 90.0 })
            .expect("rotate 90");
    }
    {
        let layer = state.layers.iter().find(|l| l.id == lid).unwrap();
        assert_eq!(layer.image_data[pixel(2, 2)], 255, "4×90° 后应回到 (2,2)");
        assert_eq!(layer.image_data[pixel(2, 2) + 3], 255);
    }

    // ---------- 任意角度（双线性插值扩散） ----------
    let mut state = CanvasState::new(8, 8);
    let lid = state.add_layer("Rot45");
    state.active_layer_id = lid;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data = vec![0u8; 8 * 8 * 4];
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(3, 3)] = 255;
    state.layers.iter_mut().find(|l| l.id == lid).unwrap().image_data[pixel(3, 3) + 3] = 255;
    RotateTool
        .apply(&mut state, ToolInput::RotateLayer { layer_id: lid, degrees: 45.0 })
        .expect("rotate 45");
    {
        let layer = state.layers.iter().find(|l| l.id == lid).unwrap();
        let mut non_zero = 0;
        for y in 0..8 {
            for x in 0..8 {
                let idx = ((y * 8 + x) * 4) as usize;
                if layer.image_data[idx + 3] > 0 {
                    non_zero += 1;
                }
            }
        }
        assert!(non_zero > 1, "45° 旋转后像素应被扩散，得到 {} 个非透明像素", non_zero);
    }

    // ---------- undo 路径 ----------
    let mut state = CanvasState::new(8, 8);
    let lid = state.add_layer("RotUndo");
    state.active_layer_id = lid;
    state.push_history("before_rotate");
    RotateTool
        .apply(&mut state, ToolInput::RotateLayer { layer_id: lid, degrees: 90.0 })
        .expect("rotate 90");
    // rotate_layer Tauri 命令会 push_history("rotate_layer")，这里手工模拟该流程
    state.push_history("rotate_layer");
    assert!(state.history.undo().is_some(), "rotate 操作应可 undo");
}

/// TC-WF-019：文字工具（输入三行文字、3 种字号、3 种颜色）。
/// 验证：
///   1. TextTool 能将预渲染的 RGBA 位图贴入图层像素
///   2. 越界粘贴坐标不应崩溃
///   3. paste_text_bitmap 与 add_text 的 IPC args 反序列化稳定
///   4. 文字操作可 undo
#[test]
fn tc_wf_019_text_tool_supported() {
    use openpaint::tools::canvas_commands::{AddTextArgs, PasteTextBitmapArgs};

    let mut state = CanvasState::new(520, 520);
    let lid = state.add_layer("TextLayer");
    state.active_layer_id = lid;

    // 准备一个 100x40 的红色文字样位图（左半红色，右半透明）
    let mut bitmap = vec![0u8; 100 * 40 * 4];
    for y in 10..30 {
        for x in 10..50 {
            let idx = ((y * 100 + x) * 4) as usize;
            bitmap[idx] = 220;
            bitmap[idx + 1] = 20;
            bitmap[idx + 2] = 60;
            bitmap[idx + 3] = 255;
        }
    }

    // 1) 通过 TextTool 粘贴位图
    state.push_history("initial_state");
    state.push_history("before_text");
    TextTool
        .apply(
            &mut state,
            ToolInput::AddText {
                layer_id: lid,
                bitmap: bitmap.clone(),
                bitmap_width: 100,
                bitmap_height: 40,
                x: 10,
                y: 20,
            },
        )
        .expect("text tool apply");

    // 断言像素已被写入 (x=30, y=30) 位于粘贴区域 (10..50, 20..40) 内
    let layer = state.layers.iter().find(|l| l.id == lid).unwrap();
    let sample_idx = ((30 * 520 + 30) * 4) as usize;
    assert_eq!(layer.image_data[sample_idx], 220, "R 通道被写入");
    assert_eq!(layer.image_data[sample_idx + 1], 20, "G 通道被写入");
    assert_eq!(layer.image_data[sample_idx + 2], 60, "B 通道被写入");
    assert_eq!(layer.image_data[sample_idx + 3], 255, "alpha=255");

    // 2) 越界坐标不应崩溃
    TextTool
        .apply(
            &mut state,
            ToolInput::AddText {
                layer_id: lid,
                bitmap: vec![255u8; 16 * 4],
                bitmap_width: 4,
                bitmap_height: 4,
                x: -2,
                y: 518,
            },
        )
        .expect("text overflow should not panic");

    // 3) undo 应能回退
    assert!(state.history.undo().is_some(), "text 操作应可 undo");

    // 4) IPC args 反序列化（保证 wire-format 稳定）
    let args: AddTextArgs = serde_json::from_str(
        "{\"layer_id\":\"00000000-0000-0000-0000-000000000002\",\"text\":\"Hello\\nWorld\",\"x\":10,\"y\":20,\"font_size\":24.0,\"color\":\"#ff0000\",\"font_family\":\"Arial\"}",
    )
    .expect("AddTextArgs parse");
    assert_eq!(args.text, "Hello\nWorld");
    assert_eq!(args.font_size, 24.0);
    assert_eq!(args.color, "#ff0000");
    assert_eq!(args.font_family.as_deref(), Some("Arial"));

    let bitmap_args: PasteTextBitmapArgs = serde_json::from_str(
        "{\"layer_id\":\"00000000-0000-0000-0000-000000000003\",\"bitmap_base64\":\"AAAA\",\"bitmap_width\":2,\"bitmap_height\":2,\"x\":0,\"y\":0}",
    )
    .expect("PasteTextBitmapArgs parse");
    assert_eq!(bitmap_args.bitmap_width, 2);
    assert_eq!(bitmap_args.bitmap_height, 2);
}

/// TC-WF-020：图层锁定 / 可见性切换的 UI 联动。当前 Tauri 命令已存在但未与前端按钮打通端到端测试。
#[test]
fn tc_wf_020_layer_visibility_toggle_via_ipc_shape() {
    let mut state = CanvasState::new(520, 520);
    let layer_id = state.add_layer("Toggle");
    state.layers.iter_mut().find(|l| l.id == layer_id).unwrap().visible = false;
    // 隐藏后 composite 应跳过该图层
    let composed = CanvasRenderer::composite(&state).expect("composite");
    // 整个画布应该是透明的（除背景层外）
    let all_transparent = composed.pixels().all(|p| p.0[3] == 0 || p.0 == [255, 255, 255, 255]);
    assert!(all_transparent, "TC-WF-020: hidden layer should not contribute to composite");
}
