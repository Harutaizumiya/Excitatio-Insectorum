// Standalone Vite development page. Never imported by the app or production build.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp } from 'antd';
import { ClassroomSystemProvider } from '../src/components/providers/classroom-system-provider';
import { DisplayScoreDrawer } from '../src/features/classroom/display-score-drawer';
import type { DisplayBootstrap } from '../src/lib/domain';
import type {
  ScoreTimelineData,
  ScoreTimelineStudent,
} from '../src/features/classroom/display-score-timeline';
import '../src/globals.css';

const asOf = Date.parse('2026-09-25T15:30:00+08:00');
const initialAt = Date.parse('2026-09-01T00:00:00+08:00');
const names = ['林知夏', '许星然', '陈予安', '宋雨桐', '周亦辰', '沈书言', '顾清和', '苏沐晴'];
const students: ScoreTimelineStudent[] = Array.from({ length: 42 }, (_, index) => {
  const empty = index === 7;
  const initialScore = index === 6 ? 0 : 100 + (index % 7);
  let score = initialScore;
  const records = empty
    ? []
    : Array.from({ length: 15 }, (_, i) => {
        const delta = i % 4 === 2 ? -5 : ((i + index) % 5) + 1;
        score += delta;
        return {
          id: `fixture-${index}-${i}`,
          at: Date.parse(
            `2026-09-${String(19 + Math.floor(i / 3)).padStart(2, '0')}T${String(8 + (i % 3) * 3).padStart(2, '0')}:20:00+08:00`,
          ),
          score,
          delta,
          reason: delta < 0 ? '课堂纪律' : '课堂积极发言',
        };
      });
  return {
    id: `fixture-${index}`,
    name: names[index] ?? `同学${String(index + 1).padStart(2, '0')}`,
    initialScore,
    initialAt,
    currentScore: score,
    records,
  };
});
const allTimes = [
  ...new Set([initialAt, ...students.flatMap((s) => s.records.map((r) => r.at)), asOf]),
].sort((a, b) => a - b);
const history: ScoreTimelineData = {
  classId: 'development-fixture',
  asOf,
  termStartAt: initialAt,
  students,
  classAverage: allTimes.map((at) => ({
    at,
    score:
      students.reduce(
        (sum, student) =>
          sum + (student.records.filter((r) => r.at <= at).at(-1)?.score ?? student.initialScore),
        0,
      ) / students.length,
  })),
};
const bootstrap: DisplayBootstrap = {
  classroom: { id: history.classId, name: '模拟数据 · 开发验收', gridCols: 7, gridRows: 6 },
  layout: {
    version: 1,
    seats: students.map((s, i) => ({
      row: Math.floor(i / 7),
      col: i % 7,
      cellType: 'seat',
      student: { id: s.id, name: s.name, score: s.currentScore },
    })),
  },
  ranking: { top3: [], progress: [] },
  schedule: { periods: [], entries: [] },
};
function Preview() {
  const [selected, setSelected] = useState('fixture-2');
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState('history');
  return (
    <AntApp>
      <ClassroomSystemProvider>
        <main
          style={{
            padding: 32,
            fontFamily: 'sans-serif',
            minWidth: 320,
            width: '100%',
            minHeight: '100vh',
          }}
        >
          <h1>积分走势 · 独立开发验收</h1>
          <p>此页为模拟数据，不调用设备历史接口，也不进入生产构建。</p>
          <select aria-label="验收数据状态" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="history">模拟记录</option>
            <option value="unavailable">历史接口不可用</option>
            <option value="empty">全班无记录</option>
            <option value="boundary">班级边界不匹配</option>
          </select>
          <button onClick={() => setOpen(true)}>打开积分走势</button>
          {open ? (
            <DisplayScoreDrawer
              bootstrap={bootstrap}
              selectedStudentId={selected}
              onSelectStudent={setSelected}
              onClose={() => setOpen(false)}
              history={
                mode === 'unavailable'
                  ? undefined
                  : mode === 'empty'
                    ? {
                        ...history,
                        students: students.map((s) => ({
                          ...s,
                          currentScore: s.initialScore,
                          records: [],
                        })),
                        classAverage: [],
                      }
                    : mode === 'boundary'
                      ? { ...history, classId: 'wrong-class' }
                      : history
              }
            />
          ) : null}
        </main>
      </ClassroomSystemProvider>
    </AntApp>
  );
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />);
