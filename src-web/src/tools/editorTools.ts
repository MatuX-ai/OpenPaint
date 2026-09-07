/**
 * Paint.NET–inspired left-rail tools, mapped onto OpenPencil's vector tool set.
 *
 * Paint.NET is a raster editor; OpenPaint's central canvas is OpenPencil (vector).
 * - Vector tools (pen / shapes / text / …) map to OpenPencil tools.
 * - Pixel tools: eraser + bucket are live on IMAGE layers; brush is comingSoon.
 */

import type { Tool as OpenPencilTool } from '@open-pencil/core/editor';

/** App-facing tool ids used by the left rail / shortcuts / Pinia. */
export type ToolType =
  | 'select'
  | 'rect-select'
  | 'hand'
  | 'pen'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'star'
  | 'frame'
  // Pixel tools — eraser/bucket live on IMAGE layers; brush coming soon
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'gradient'
  | 'eyedropper'
  | 'lasso'
  | 'ellipse-select'
  | 'magic-wand';

export type ToolAvailability = 'live' | 'comingSoon';

export interface EditorToolDef {
  id: ToolType;
  label: string;
  /** Short hint shown in title / aria. */
  hint: string;
  shortcut: string;
  availability: ToolAvailability;
  /** OpenPencil tool to activate when availability === 'live'. */
  openPencil?: OpenPencilTool;
  /** Optional flyout siblings (Paint.NET shape / selection groups). */
  flyout?: ToolType[];
}

/** Primary rail order — mirrors Paint.NET Tools window grouping. */
export const PRIMARY_TOOLS: EditorToolDef[] = [
  {
    id: 'select',
    label: '选择 / 移动',
    hint: '选中并移动对象（对齐 Paint.NET Move）',
    shortcut: 'V',
    availability: 'live',
    openPencil: 'SELECT',
  },
  {
    id: 'rect-select',
    label: '矩形选区',
    hint: '框选多个对象（OpenPencil 选择工具；非像素选区）',
    shortcut: 'M',
    availability: 'live',
    openPencil: 'SELECT',
    flyout: ['rect-select'],
  },
  {
    id: 'lasso',
    label: '套索选区',
    hint: '自由选区（像素工具，即将推出）',
    shortcut: 'S',
    availability: 'comingSoon',
  },
  {
    id: 'ellipse-select',
    label: '椭圆选区',
    hint: '椭圆选区（像素工具，即将推出）',
    shortcut: '',
    availability: 'comingSoon',
  },
  {
    id: 'magic-wand',
    label: '魔棒',
    hint: '按颜色容差选区（像素工具，即将推出）',
    shortcut: '',
    availability: 'comingSoon',
  },
  {
    id: 'hand',
    label: '平移',
    hint: '拖动画布（对齐 Paint.NET Pan）',
    shortcut: 'H',
    availability: 'live',
    openPencil: 'HAND',
  },
  {
    id: 'pen',
    label: '钢笔 / 路径',
    hint: '矢量路径：顶栏调描边颜色/线宽；点加点；点回起点闭合；Enter 结束；Esc 取消',
    shortcut: 'B',
    availability: 'live',
    openPencil: 'PEN',
  },
  {
    id: 'brush',
    label: '画笔',
    hint: '像素画笔（在 IMAGE 图层上绘制；即将推出）',
    shortcut: '',
    availability: 'comingSoon',
  },
  {
    id: 'eraser',
    label: '橡皮',
    hint: '在像素图层上擦除（无像素图层时自动新建）',
    shortcut: 'E',
    availability: 'live',
  },
  {
    id: 'bucket',
    label: '油漆桶',
    hint: '在像素图层上按容差填充连通区域',
    shortcut: 'F',
    availability: 'live',
  },
  {
    id: 'gradient',
    label: '渐变',
    hint: '渐变填充（即将推出）',
    shortcut: 'G',
    availability: 'comingSoon',
  },
  {
    id: 'eyedropper',
    label: '吸管',
    hint: '拾取颜色（即将推出）',
    shortcut: 'K',
    availability: 'comingSoon',
  },
  {
    id: 'text',
    label: '文字',
    hint: '放置文字；顶栏调字号与颜色',
    shortcut: 'T',
    availability: 'live',
    openPencil: 'TEXT',
  },
  {
    id: 'rectangle',
    label: '矩形',
    hint: '绘制矩形；顶栏调填充 / 描边',
    shortcut: 'R',
    availability: 'live',
    openPencil: 'RECTANGLE',
    flyout: ['rectangle', 'ellipse', 'line', 'polygon', 'star'],
  },
  {
    id: 'ellipse',
    label: '椭圆',
    hint: '绘制椭圆；顶栏调填充 / 描边',
    shortcut: 'O',
    availability: 'live',
    openPencil: 'ELLIPSE',
  },
  {
    id: 'line',
    label: '直线',
    hint: '绘制直线；顶栏调颜色 / 线宽',
    shortcut: 'L',
    availability: 'live',
    openPencil: 'LINE',
  },
  {
    id: 'polygon',
    label: '多边形',
    hint: '绘制多边形；顶栏调边数与填充 / 描边',
    shortcut: '',
    availability: 'live',
    openPencil: 'POLYGON',
  },
  {
    id: 'star',
    label: '星形',
    hint: '绘制星形；顶栏调角数与填充 / 描边',
    shortcut: '',
    availability: 'live',
    openPencil: 'STAR',
  },
  {
    id: 'frame',
    label: '画框',
    hint: '创建 Frame 容器；顶栏可调填充',
    shortcut: 'A',
    availability: 'live',
    openPencil: 'FRAME',
  },
];

/** Compact rail: one button per group (flyouts hold the rest). */
export const RAIL_TOOL_IDS: ToolType[] = [
  'select',
  'rect-select',
  'hand',
  'pen',
  'brush',
  'eraser',
  'bucket',
  'gradient',
  'eyedropper',
  'text',
  'rectangle',
  'frame',
];

/** Display label for the shapes group button on the rail (parent of flyout). */
export function railLabel(id: ToolType): string {
  if (id === 'rectangle') return '形状';
  return getToolDef(id)?.label ?? id;
}

const BY_ID = new Map(PRIMARY_TOOLS.map((t) => [t.id, t]));

export function getToolDef(id: ToolType): EditorToolDef | undefined {
  return BY_ID.get(id);
}

export function toOpenPencilTool(id: ToolType): OpenPencilTool | null {
  const def = BY_ID.get(id);
  if (!def || def.availability !== 'live' || !def.openPencil) return null;
  return def.openPencil;
}

/** Best-effort reverse map when OpenPencil toolbar / shortcuts change the tool. */
export function fromOpenPencilTool(tool: OpenPencilTool): ToolType {
  switch (tool) {
    case 'SELECT':
      return 'select';
    case 'HAND':
      return 'hand';
    case 'PEN':
      return 'pen';
    case 'TEXT':
      return 'text';
    case 'RECTANGLE':
      return 'rectangle';
    case 'ELLIPSE':
      return 'ellipse';
    case 'LINE':
      return 'line';
    case 'POLYGON':
      return 'polygon';
    case 'STAR':
      return 'star';
    case 'FRAME':
    case 'SECTION':
      return 'frame';
    default:
      return 'select';
  }
}

export function toolLabel(id: ToolType): string {
  return BY_ID.get(id)?.label ?? id;
}

/** Pixel tools that edit IMAGE layers (not OpenPencil vector tools). */
export function isRasterTool(id: ToolType): boolean {
  return id === 'brush' || id === 'eraser' || id === 'bucket';
}

/** Shape draw tools that create filled/stroked nodes. */
export function isShapeDrawTool(id: ToolType): boolean {
  return (
    id === 'rectangle' ||
    id === 'ellipse' ||
    id === 'line' ||
    id === 'polygon' ||
    id === 'star' ||
    id === 'frame'
  );
}

/** Tools that show vector style controls on the canvas toolbar. */
export function isVectorStyleTool(id: ToolType): boolean {
  return id === 'pen' || id === 'text' || isShapeDrawTool(id);
}
