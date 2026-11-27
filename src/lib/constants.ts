export const PAGE_NAME: Record<string, string> = {
  home: "首页",
  bookshelf: "书架",
  bookshelfCategory: "分类",
  reader: "阅读页",
  statistics: "统计",
  profile: "我的",
  splash: "启动图",
  photo: "截图",
}

export const CAPTION_PRESETS = [
  "首页",
  "书架",
  "书架分类",
  "阅读页",
  "阅读中",
  "目录",
  "书签",
  "统计",
  "阅读统计",
  "笔记",
  "我的",
  "设置",
  "搜索",
  "启动图",
  "登录页",
  "深色模式",
  "浅色模式",
  "详情页",
]

export const PAGE_OPTIONS = [
  { key: "bookshelf", name: "书架" },
  { key: "bookshelfCategory", name: "书架分类" },
  { key: "home", name: "首页" },
  { key: "statistics", name: "统计" },
  { key: "profile", name: "我的" },
  { key: "reader", name: "阅读页" },
  { key: "splash", name: "启动图" },
  { key: "photo", name: "自选截图" },
]

export const COLOR_LABELS = {
  primaryColor: "主色",
  backgroundColor: "背景",
  foregroundColor: "文字",
  mutedForegroundColor: "辅助文字",
  cardColor: "卡片",
  borderColor: "边框",
} as const

export type ColorKey = keyof typeof COLOR_LABELS
export type Colors = Record<ColorKey, string>

export const LIGHT_COLORS: Colors = {
  backgroundColor: "#F4EDE5",
  foregroundColor: "#342E2A",
  mutedForegroundColor: "#8A8178",
  primaryColor: "#8B8174",
  cardColor: "#F9F6F0",
  borderColor: "#D8D0C5",
}

export const DARK_COLORS: Colors = {
  backgroundColor: "#1D1E22",
  foregroundColor: "#EDE8E0",
  mutedForegroundColor: "#9A948B",
  primaryColor: "#8B8174",
  cardColor: "#26272C",
  borderColor: "#3A3B41",
}

export const REEDEN_KEYS: Record<string, ColorKey> = {
  primaryColor: "primaryColor",
  backgroundColor: "backgroundColor",
  foregroundColor: "foregroundColor",
  mutedForegroundColor: "mutedForegroundColor",
  cardColor: "cardColor",
  borderColor: "borderColor",
  accentColor: "primaryColor",
  dividerColor: "borderColor",
}

export const SWATCHES = [
  "#000000",
  "#FFFFFF",
  "#3778B3",
  "#8B8174",
  "#C0503A",
  "#4A7C59",
  "#6B5B95",
  "#D4A574",
  "#2E3440",
  "#E4EEF8",
]

export const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
]
