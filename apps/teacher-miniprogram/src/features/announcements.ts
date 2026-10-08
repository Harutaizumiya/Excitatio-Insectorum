export function minimumAnnouncementSeconds(text: string, repeatCount: number): number {
  return Math.ceil((Array.from(text).length / 3) * repeatCount + 2 * (repeatCount - 1) + 3);
}

export function validateAnnouncement(
  text: string,
  repeatCount: number,
  durationSeconds: number,
  minimumSeconds: number,
): string | null {
  const length = Array.from(text.trim()).length;
  if (length < 1 || length > 100) return '喊话内容应为 1～100 字';
  if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 5)
    return '播报次数须为 1～5 次';
  if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 180)
    return '显示时间须为 10～180 秒';
  if (durationSeconds < minimumSeconds) return `按预估语速至少需要 ${minimumSeconds} 秒`;
  if (minimumSeconds > 180) return '请减少文字或播报次数';
  return null;
}
