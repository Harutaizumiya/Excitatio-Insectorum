import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CloseOutlined, PauseOutlined, CaretRightOutlined } from '@ant-design/icons';
import { useRealtimeClient } from '@/components/providers/classroom-system-provider';
import type { DisplayBootstrap } from '@/lib/domain';
import {
  SCORE_RANGES,
  nearestRecord,
  rangeEnd,
  rangeStart,
  scoreRange,
  type ScoreRange,
  type ScoreTimelineData,
  type ScoreTimelineRecord,
} from './display-score-timeline';
import './display-score-drawer.css';

const number = (value: number) =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`;
const date = (at: number, time = false) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    ...(time ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
  }).format(at);
const tone = (delta: number) => (delta > 0 ? '#2dc99b' : delta < 0 ? '#ef777e' : '#a7a7ad');
type Point = { at: number; score: number };

const ScoreChart = memo(function ScoreChart({
  points,
  comparison = [],
  records = [],
  selected,
  onInspect,
  mini = false,
  color = '#2dc99b',
}: {
  points: Point[];
  comparison?: Point[];
  records?: ScoreTimelineRecord[];
  selected?: ScoreTimelineRecord | null;
  onInspect?: (record: ScoreTimelineRecord | null) => void;
  mini?: boolean;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const holding = useRef(false);
  const start = points[0]?.at ?? 0;
  const end = points.at(-1)?.at ?? start + 1;
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const draw = () => {
      const width = frame.clientWidth;
      const height = frame.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      if (!points.length) return;
      const left = mini ? 2 : 8;
      const right = mini ? 2 : 64;
      const top = mini ? 3 : 24;
      const bottom = mini ? 3 : 40;
      const values = [...points, ...comparison].map((p) => p.score);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const margin = Math.max((max - min) * 0.18, 2);
      const low = min - margin;
      const high = max + margin;
      const x = (at: number) =>
        left + ((at - start) / Math.max(1, end - start)) * (width - left - right);
      const y = (score: number) => top + ((high - score) / (high - low)) * (height - top - bottom);
      if (!mini) {
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        for (let i = 0; i < 4; i++) {
          const value = high - ((high - low) * i) / 3;
          ctx.strokeStyle = '#242428';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(left, y(value));
          ctx.lineTo(width - right, y(value));
          ctx.stroke();
          ctx.fillStyle = '#85858f';
          ctx.fillText(number(value), width - right + 14, y(value) + 4);
        }
        for (let i = 0; i < 5; i++) {
          const at = start + ((end - start) * i) / 4;
          const label =
            end - start < 86400000
              ? new Intl.DateTimeFormat('zh-CN', {
                  timeZone: 'Asia/Taipei',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(at)
              : date(at);
          ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
          ctx.fillText(label, x(at), height - 10);
        }
        ctx.textAlign = 'left';
      }
      const line = (series: Point[], stroke: string, dashed = false) => {
        ctx.beginPath();
        series.forEach((p, i) =>
          i === 0 ? ctx.moveTo(x(p.at), y(p.score)) : ctx.lineTo(x(p.at), y(p.score)),
        );
        ctx.strokeStyle = stroke;
        ctx.lineWidth = mini ? 1.4 : 2;
        ctx.setLineDash(dashed ? [5, 5] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      if (!mini) {
        ctx.beginPath();
        ctx.moveTo(x(points[0].at), height - bottom);
        points.forEach((p) => ctx.lineTo(x(p.at), y(p.score)));
        ctx.lineTo(x(points.at(-1)!.at), height - bottom);
        ctx.closePath();
        ctx.fillStyle = `${color}0d`;
        ctx.fill();
      }
      if (comparison.length) line(comparison, '#939dab', true);
      line(points, color);
      const marker = selected ?? points.at(-1)!;
      if (!mini) {
        if (selected) {
          ctx.strokeStyle = '#95959c';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x(marker.at), top);
          ctx.lineTo(x(marker.at), height - bottom);
          ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x(marker.at), y(marker.score), 4, 0, Math.PI * 2);
        ctx.fill();
        if (!selected) {
          ctx.fillStyle = color;
          ctx.fillRect(width - right + 6, y(marker.score) - 12, 54, 25);
          ctx.fillStyle = '#101113';
          ctx.fillText(number(marker.score), width - right + 12, y(marker.score) + 5);
        }
      }
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(frame);
    return () => resize.disconnect();
  }, [points, comparison, selected, mini, color, start, end]);

  const inspect = (clientX: number) => {
    const bounds = frameRef.current!.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - bounds.left - 8) / (bounds.width - 72)));
    onInspect?.(nearestRecord(records, start + fraction * (end - start)));
  };
  return (
    <div
      ref={frameRef}
      className={mini ? 'score-sparkline' : 'score-chart'}
      role={mini ? 'img' : 'slider'}
      aria-label={mini ? '本周积分走势' : '积分记录，按住拖动或使用左右方向键查看'}
      tabIndex={mini || !records.length ? undefined : 0}
      aria-valuemin={mini ? undefined : 1}
      aria-valuemax={mini ? undefined : Math.max(1, records.length)}
      aria-valuenow={
        mini
          ? undefined
          : selected
            ? records.findIndex((r) => r.id === selected.id) + 1
            : Math.max(1, records.length)
      }
      aria-valuetext={
        selected
          ? `${date(selected.at, true)}，${selected.score}分，${signed(selected.delta)}，${selected.reason}`
          : undefined
      }
      onPointerDown={
        mini
          ? undefined
          : (e) => {
              if (e.button !== 0) return;
              holding.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              inspect(e.clientX);
            }
      }
      onPointerMove={
        mini
          ? undefined
          : (e) => {
              if (holding.current) inspect(e.clientX);
            }
      }
      onPointerUp={
        mini
          ? undefined
          : (e) => {
              holding.current = false;
              e.currentTarget.releasePointerCapture(e.pointerId);
              onInspect?.(null);
            }
      }
      onPointerCancel={() => {
        holding.current = false;
        onInspect?.(null);
      }}
      onLostPointerCapture={() => {
        holding.current = false;
        onInspect?.(null);
      }}
      onBlur={() => onInspect?.(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onInspect?.(null);
          return;
        }
        if (!records.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const index = selected
          ? records.findIndex((r) => r.id === selected.id)
          : records.length - 1;
        onInspect?.(
          records[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? records.length - 1
                : Math.max(
                    0,
                    Math.min(records.length - 1, index + (e.key === 'ArrowLeft' ? -1 : 1)),
                  )
          ],
        );
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {!mini && selected ? (
        <div
          className="score-record-tooltip"
          style={{
            left: `${Math.min(75, Math.max(2, ((selected.at - start) / Math.max(1, end - start)) * 88))}%`,
          }}
        >
          <time>{date(selected.at, true)}</time>
          <strong style={{ color: tone(selected.delta) }}>
            {selected.reason || '积分变动'} {signed(selected.delta)}
          </strong>
        </div>
      ) : null}
    </div>
  );
});

export function DisplayScoreDrawer({
  bootstrap,
  selectedStudentId,
  onSelectStudent,
  onClose,
  history,
  historyLoading = false,
  historyError = false,
  onRetry,
}: {
  bootstrap: DisplayBootstrap;
  selectedStudentId: string;
  onSelectStudent: (id: string) => void;
  onClose: () => void;
  /** Real display history or the isolated verification fixture. */
  history?: ScoreTimelineData;
  historyLoading?: boolean;
  historyError?: boolean;
  onRetry?: () => void;
}) {
  const realtime = useRealtimeClient();
  const [status, setStatus] = useState(realtime.getStatus());
  const [range, setRange] = useState<ScoreRange>('本周');
  const [compare, setCompare] = useState(true);
  const [record, setRecord] = useState<ScoreTimelineRecord | null>(null);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const tickerDrag = useRef<{ x: number; scroll: number } | null>(null);
  const tickerMoved = useRef(false);
  const safeHistory = history?.classId === bootstrap.classroom.id ? history : undefined;
  const students = useMemo(
    () =>
      safeHistory?.students.map((s) => ({ id: s.id, name: s.name, score: s.currentScore })) ??
      Array.from(
        new Map([
          ...bootstrap.layout.seats.flatMap((seat) =>
            seat.student ? [[seat.student.id, seat.student] as const] : [],
          ),
          ...bootstrap.ranking.top3.map(
            (s) => [s.studentId, { id: s.studentId, name: s.name, score: s.score }] as const,
          ),
        ]).values(),
      ),
    [bootstrap, safeHistory],
  );
  const selected = students.find((student) => student.id === selectedStudentId) ?? students[0];
  const now = safeHistory?.asOf ?? Date.now();
  const start = rangeStart(range, now, safeHistory?.termStartAt);
  const end = rangeEnd(range, now, safeHistory?.termEndAt);
  const source = safeHistory?.students.find((student) => student.id === selected?.id);
  const series = useMemo(
    () => (source && start !== null ? scoreRange(source, start, end, safeHistory?.periods) : null),
    [source, start, end, safeHistory?.periods],
  );
  const weekStart = rangeStart('本周', now)!;
  const weekly = useMemo(
    () =>
      new Map(
        safeHistory?.students.map((student) => [
          student.id,
          scoreRange(student, weekStart, now, safeHistory.periods),
        ]),
      ),
    [safeHistory, weekStart, now],
  );
  const comparison = useMemo(() => {
    if (!safeHistory || !series?.points.length || !compare) return [];
    const from = series.points[0].at;
    const before = safeHistory.classAverage.filter((p) => p.at < from).at(-1);
    return [
      ...(before ? [{ at: from, score: before.score }] : []),
      ...safeHistory.classAverage.filter((p) => p.at >= from && p.at <= end),
    ];
  }, [safeHistory, series, compare, end]);
  const stopped = paused || hovering || focused || reducedMotion || Boolean(record);
  useEffect(() => realtime.subscribeStatus(setStatus), [realtime]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (stopped) return;
    const ticker = tickerRef.current;
    const group = groupRef.current;
    if (!ticker || !group) return;
    let animation = 0;
    let previous = 0;
    let position = ticker.scrollLeft;
    const step = (time: number) => {
      const width = group.getBoundingClientRect().width;
      if (previous && width > ticker.clientWidth) {
        position = (position + (Math.min(time - previous, 64) * 24) / 1000) % width;
        ticker.scrollLeft = position;
      }
      previous = time;
      animation = requestAnimationFrame(step);
    };
    animation = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animation);
  }, [stopped, students]);

  const select = (id: string) => {
    setRecord(null);
    onSelectStudent(id);
  };
  const available = Boolean(safeHistory);
  const current = record?.score ?? (available ? series?.current : selected?.score);
  const delta = series ? (record?.score ?? series.current) - series.initial : null;
  const percent =
    series && series.initial > 0 && delta !== null ? (delta / series.initial) * 100 : null;
  return (
    <dialog
      ref={dialogRef}
      className="display-score-drawer"
      aria-labelledby="score-drawer-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget && e.clientY < e.currentTarget.getBoundingClientRect().top)
          onClose();
      }}
    >
      <div className="score-drawer-handle" aria-hidden="true" />
      <header className="score-drawer-header">
        <div>
          <h2 id="score-drawer-title">积分走势</h2>
          <span>{bootstrap.classroom.name}</span>
        </div>
        <button onClick={onClose} aria-label="关闭积分走势">
          <CloseOutlined />
        </button>
      </header>
      <section className="score-ticker-section" aria-label="学生积分">
        <div className="score-ticker-heading">
          <span>{available ? '全班动态' : '学生积分'}</span>
          <div>
            {available ? <span>本周</span> : null}
            <button
              onClick={() => setPaused((value) => !value)}
              disabled={reducedMotion}
              aria-label={paused ? '继续滚动' : '暂停滚动'}
            >
              {paused || reducedMotion ? <CaretRightOutlined /> : <PauseOutlined />}
              {paused || reducedMotion ? '继续' : '暂停'}
            </button>
          </div>
        </div>
        <div
          ref={tickerRef}
          className="score-ticker"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onPointerDown={(e) => {
            tickerMoved.current = false;
            if (e.pointerType !== 'mouse') {
              setPaused(true);
              return;
            }
            if (e.button === 0)
              tickerDrag.current = { x: e.clientX, scroll: e.currentTarget.scrollLeft };
          }}
          onPointerMove={(e) => {
            if (!tickerDrag.current) return;
            const distance = e.clientX - tickerDrag.current.x;
            if (Math.abs(distance) > 6) {
              tickerMoved.current = true;
              setPaused(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              e.currentTarget.scrollLeft = tickerDrag.current.scroll - distance;
            }
          }}
          onPointerUp={() => {
            tickerDrag.current = null;
          }}
          onPointerCancel={() => {
            tickerDrag.current = null;
          }}
          onClickCapture={(e) => {
            if (tickerMoved.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
          }}
        >
          {[0, 1].map((copy) => (
            <div
              className="score-ticker-group"
              ref={copy === 0 ? groupRef : undefined}
              key={copy}
              aria-hidden={copy === 1 ? true : undefined}
            >
              {students.map((student) => {
                const trend = weekly.get(student.id);
                return (
                  <button
                    key={student.id}
                    tabIndex={copy ? -1 : 0}
                    aria-pressed={selected?.id === student.id}
                    onClick={() => select(student.id)}
                    className="score-ticker-card"
                  >
                    <span>
                      <strong>{student.name}</strong>
                      <small style={{ color: trend ? tone(trend.delta) : undefined }}>
                        {number(student.score)}分{trend ? ` · ${signed(trend.delta)}` : ''}
                      </small>
                    </span>
                    {trend?.points.length ? (
                      <ScoreChart points={trend.points} color={tone(trend.delta)} mini />
                    ) : (
                      <span className="score-mini-empty">{available ? '暂无记录' : '—'}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <section className="score-main" aria-label={`${selected?.name ?? '学生'}积分`}>
        <div className="score-summary">
          <div>
            <h3>{selected?.name ?? '暂无学生'}</h3>
            <strong className="score-current">
              {current === undefined ? '—' : number(current)}
            </strong>
            <div className="score-change">
              {delta !== null ? (
                <strong style={{ color: tone(delta) }}>
                  {signed(delta)}
                  {percent !== null ? ` (${signed(percent)}%)` : ''}
                </strong>
              ) : null}
              <span>
                {record ? date(record.at, true) : available ? `${range} · 较期初` : '当前积分'}
              </span>
            </div>
          </div>
          <div className="score-updated">
            {series?.points.length ? (
              <span>
                {date(series.points[0].at)} — {date(end)}
              </span>
            ) : null}
            <small>
              {historyLoading
                ? '加载中'
                : historyError
                  ? '更新失败'
                  : !history && status !== 'CONNECTED'
                    ? '更新暂停'
                    : safeHistory
                      ? `更新于 ${date(now, true)}`
                      : ''}
            </small>
          </div>
        </div>
        <div className="score-controls">
          <div role="group" aria-label="积分时间范围">
            {SCORE_RANGES.map((label) => (
              <button
                key={label}
                aria-pressed={range === label}
                onClick={() => {
                  setRange(label);
                  setRecord(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={compare && available}
              disabled={!available || !safeHistory?.classAverage.length}
              onChange={(e) => setCompare(e.target.checked)}
            />
            班级均分
          </label>
        </div>
        {!available && historyLoading ? (
          <div className="score-empty" role="status">
            历史积分加载中
          </div>
        ) : !available && historyError ? (
          <div className="score-empty" role="status">
            <strong>历史积分加载失败</strong>
            <button
              className="rounded-md border border-[#4b4b53] bg-[#29292e] px-4 py-2 text-[#f0f0f3] disabled:opacity-50"
              onClick={onRetry}
              disabled={historyLoading}
            >
              重试
            </button>
          </div>
        ) : !available ? (
          <div className="score-empty" role="status">
            <strong>历史积分暂不可用</strong>
            <span>当前可查看学生最新积分</span>
          </div>
        ) : start === null ? (
          <div className="score-empty" role="status">
            暂无学期数据
          </div>
        ) : !series?.records.length ? (
          <div className="score-empty" role="status">
            暂无积分记录
          </div>
        ) : (
          <ScoreChart
            points={series.points}
            records={series.records}
            selected={record}
            onInspect={setRecord}
            comparison={comparison}
            color={tone(series.delta)}
          />
        )}
        <dl className="score-stats">
          {[
            ['期初', series?.initial],
            ['最高', series?.records.length ? series.high : undefined],
            ['最低', series?.records.length ? series.low : undefined],
            ['班级均分', safeHistory?.classAverage.at(-1)?.score],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{typeof value === 'number' ? number(value) : '—'}</dd>
            </div>
          ))}
          <div>
            <dt>当前排名</dt>
            <dd>
              {safeHistory && selected
                ? `${safeHistory.students.filter((student) => student.currentScore > selected.score).length + 1} / ${students.length}`
                : '—'}
            </dd>
          </div>
        </dl>
      </section>
    </dialog>
  );
}
