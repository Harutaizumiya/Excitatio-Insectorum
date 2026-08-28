import { classroomRealtime } from "./classroom-realtime";
import type { DisplayBootstrap, Seat } from "./classroom-model";

function createDisplaySeats(): Seat[] {
  return Array.from({ length: 7 * 9 }, (_, index) => {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const student = row === 1 && col === 2 ? { id: "student-1", name: "张三" } : null;

    return {
      id: "display-seat-" + String(row + 1) + "-" + String(col + 1),
      row,
      col,
      student,
    };
  });
}

const displayBootstrap: DisplayBootstrap = {
  classroom: { id: "class-1", name: "高一 (10) 班", gridRows: 7, gridCols: 9 },
  layout: {
    version: 7,
    seats: createDisplaySeats(),
  },
  ranking: {
    top3: [
      { studentId: "student-1", name: "张三", rank: 1 },
      { studentId: "student-2", name: "李四", rank: 2 },
      { studentId: "student-3", name: "王五", rank: 3 },
    ],
    progress: [
      { studentId: "student-4", name: "赵六", change: 8 },
      { studentId: "student-11", name: "钱七", change: 5 },
      { studentId: "student-12", name: "孙八", change: 4 },
      { studentId: "student-7", name: "周九", change: 3 },
      { studentId: "student-8", name: "吴十", change: 3 },
      { studentId: "student-13", name: "郑十一", change: 2 },
      { studentId: "student-14", name: "陈十二", change: 2 },
      { studentId: "student-15", name: "楚十三", change: 2 },
      { studentId: "student-16", name: "魏十四", change: 1 },
      { studentId: "student-17", name: "蒋十五", change: 1 },
    ],
  },
};

function cloneBootstrap(): DisplayBootstrap {
  return {
    classroom: { ...displayBootstrap.classroom },
    layout: {
      version: displayBootstrap.layout.version,
      seats: displayBootstrap.layout.seats.map((seat) => ({
        ...seat,
        student: seat.student ? { ...seat.student } : null,
      })),
    },
    ranking: {
      top3: displayBootstrap.ranking.top3.map((item) => ({ ...item })),
      progress: displayBootstrap.ranking.progress.map((item) => ({ ...item })),
    },
  };
}

export const displayMock = {
  getBootstrap(): DisplayBootstrap {
    return cloneBootstrap();
  },
};

export { classroomRealtime };
