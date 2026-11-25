import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import type { StudioApi } from "@/hooks/useStudio"
import { RangeRow } from "./shared"

export function ExportSection({ studio }: { studio: StudioApi }) {
  return (
    <div className="space-y-4">
      <RangeRow
        label="PNG 宽度"
        value={studio.pngWidth}
        min={640}
        max={3840}
        step={64}
        onChange={studio.setPngWidth}
        display={String(studio.pngWidth)}
      />
      {studio.videoAvailable ? (
        <>
          <RangeRow
            label="视频时长"
            value={studio.videoDuration}
            min={1}
            max={10}
            step={0.5}
            onChange={studio.setVideoDuration}
            display={`${studio.videoDuration}s`}
          />
          <RangeRow
            label="视频帧率"
            value={studio.videoFps}
            min={12}
            max={30}
            step={1}
            onChange={studio.setVideoFps}
            display={String(studio.videoFps)}
          />
          <div className="flex items-center gap-3">
            <span className="field-label flex-1">视频清晰度</span>
            <Select
              value={String(studio.videoQuality)}
              onValueChange={(value) => studio.setVideoQuality(Number(value))}
            >
              <SelectTrigger size="sm" className="w-[190px]">
                <SelectValue placeholder="清晰度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">标准 · 640px</SelectItem>
                <SelectItem value="1.5">清晰 · 960px</SelectItem>
                <SelectItem value="1.7">高清 · 1088px</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}
      <div className="flex items-center gap-3">
        <span className="field-label flex-1">批量内容</span>
        <Select
          value={studio.batchFormat}
          onValueChange={(value) => studio.setBatchFormat(value as "images" | "videos" | "both")}
        >
          <SelectTrigger size="sm" className="w-[190px]">
            <SelectValue placeholder="批量内容" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="images">仅 PNG 图片</SelectItem>
            <SelectItem value="videos" disabled={!studio.videoAvailable}>
              仅视频
            </SelectItem>
            <SelectItem value="both" disabled={!studio.videoAvailable}>
              图片 + 视频
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={studio.actions.runExportPng} disabled={studio.exporting}>
          PNG 图片
        </Button>
        <Button
          size="sm"
          onClick={studio.actions.runExportVideo}
          disabled={studio.exporting || !studio.videoAvailable}
          title={
            studio.videoAvailable
              ? "优先用 WebCodecs 逐帧编码为 MP4，必要时回退到浏览器录制"
              : "当前浏览器不支持视频录制"
          }
        >
          视频（MP4）
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={studio.actions.runBatchExport}
          disabled={studio.exporting || !studio.shots.length}
          title="按模板容量分组导出，打包为 ZIP"
        >
          批量导出 ZIP
        </Button>
      </div>
      {studio.videoAvailable ? (
        <p className="hint-text">
          优先使用 WebCodecs 逐帧编码（更快、不依赖实时录制），不可用时自动回退到浏览器录制接口；回退时请保持页面在前台。iOS / iPadOS Safari 16.4+ 支持。
        </p>
      ) : (
        <p className="hint-text">
          当前环境没有可用的视频编码器（iOS / iPadOS Safari 需 16.4+）。PNG 图片和批量 ZIP 不受影响。
        </p>
      )}
      {studio.shots.length > 0 ? (
        <p className="hint-text">
          批量导出会把 {studio.shots.length} 张素材按每 {studio.currentTpl?.count ?? 6} 张一组，共 {Math.ceil(studio.shots.length / (studio.currentTpl?.count ?? 6))} 组；
          {studio.batchFormat === "images"
            ? "每组生成 1 张 PNG 图片。"
            : studio.batchFormat === "videos"
              ? `每组生成 1 段 ${studio.videoDuration}s 视频。`
              : `每组生成 1 张 PNG 图片和 1 段 ${studio.videoDuration}s 视频。`}
        </p>
      ) : null}
      {studio.progressVisible ? (
        <Progress value={Math.round(studio.progress * 100)} className="w-full" />
      ) : null}
      <p className="hint-text">{studio.exportStatus}</p>
    </div>
  )
}
