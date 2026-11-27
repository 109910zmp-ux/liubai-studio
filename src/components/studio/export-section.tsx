import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
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
  const { t } = useI18n()
  const qualityOptions = [
    { value: "1", label: t("标准 · 640px") },
    { value: "1.5", label: t("清晰 · 960px") },
    { value: "1.7", label: t("高清 · 1088px") },
  ]
  const batchOptions = [
    { value: "images", label: t("仅 PNG 图片") },
    { value: "videos", label: t("仅视频") },
    { value: "both", label: t("图片 + 视频") },
  ]
  const qualityLabel =
    qualityOptions.find((option) => option.value === String(studio.videoQuality))?.label ?? t("清晰度")
  const batchLabel =
    batchOptions.find((option) => option.value === studio.batchFormat)?.label ?? t("批量内容")
  return (
    <div className="space-y-4">
      <RangeRow
        label={t("PNG 宽度")}
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
            label={t("视频时长")}
            value={studio.videoDuration}
            min={1}
            max={10}
            step={0.5}
            onChange={studio.setVideoDuration}
            display={`${studio.videoDuration}s`}
          />
          <RangeRow
            label={t("视频帧率")}
            value={studio.videoFps}
            min={12}
            max={30}
            step={1}
            onChange={studio.setVideoFps}
            display={String(studio.videoFps)}
          />
          <div className="flex items-center gap-3">
            <span className="field-label flex-1">{t("视频清晰度")}</span>
            <Select
              value={String(studio.videoQuality)}
              onValueChange={(value) => studio.setVideoQuality(Number(value))}
            >
              <SelectTrigger size="sm" className="w-[190px]">
                <SelectValue placeholder={t("清晰度")}>{qualityLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {qualityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} label={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}
      <div className="flex items-center gap-3">
        <span className="field-label flex-1">{t("批量内容")}</span>
        <Select
          value={studio.batchFormat}
          onValueChange={(value) => studio.setBatchFormat(value as "images" | "videos" | "both")}
        >
          <SelectTrigger size="sm" className="w-[190px]">
            <SelectValue placeholder={t("批量内容")}>{batchLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {batchOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                label={option.label}
                disabled={option.value !== "images" && !studio.videoAvailable}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={studio.actions.runExportPng} disabled={studio.exporting}>
          {t("PNG 图片")}
        </Button>
        <Button
          size="sm"
          onClick={studio.actions.runExportVideo}
          disabled={studio.exporting || !studio.videoAvailable}
          title={
            studio.videoAvailable
              ? t("优先用 WebCodecs 逐帧编码为 MP4，必要时回退到浏览器录制")
              : t("当前浏览器不支持视频录制")
          }
        >
          {t("视频（MP4）")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={studio.actions.runBatchExport}
          disabled={studio.exporting || !studio.shots.length}
          title={t("按模板容量分组导出，打包为 ZIP")}
        >
          {t("批量导出 ZIP")}
        </Button>
        {studio.exporting ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={studio.actions.cancelExport}
            title={t("中止当前导出（已完成的文件不会生成）")}
          >
            {t("取消导出")}
          </Button>
        ) : null}
      </div>
      {studio.videoAvailable ? null : (
        <p className="hint-text">
          {t("当前环境没有可用的视频编码器（iOS / iPadOS Safari 需 16.4+）。PNG 图片和批量 ZIP 不受影响。")}
        </p>
      )}
      {studio.shots.length > 0 ? (
        <p className="hint-text">
          {t("批量导出会把 {count} 张素材按每 {size} 张一组，共 {groups} 组", {
            count: studio.shots.length,
            size: studio.currentTpl?.count ?? 6,
            groups: Math.ceil(studio.shots.length / (studio.currentTpl?.count ?? 6)),
          })}；
          {studio.batchFormat === "images"
            ? t("每组生成 1 张 PNG 图片。")
            : studio.batchFormat === "videos"
              ? t("每组生成 1 段 {duration}s 视频。", { duration: studio.videoDuration })
              : t("每组生成 1 张 PNG 图片和 1 段 {duration}s 视频。", { duration: studio.videoDuration })}
        </p>
      ) : null}
      {studio.progressVisible ? (
        <Progress value={Math.round(studio.progress * 100)} className="w-full" />
      ) : null}
      <p className="hint-text">{studio.exportStatus}</p>
    </div>
  )
}
