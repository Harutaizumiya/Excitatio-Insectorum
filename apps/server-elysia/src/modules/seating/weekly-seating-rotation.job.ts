import { Cron } from 'croner';
import {
  createWeeklySeatingRotationTask,
  type WeeklyRotationRunResult,
} from './weekly-seating-rotation.service';

function logResult(result: WeeklyRotationRunResult): void {
  const rotated = result.classes.filter((item) => item.status === 'ROTATED').length;
  const skipped = result.classes.filter((item) => item.status === 'SKIPPED').length;
  const failed = result.classes.filter((item) => item.status === 'FAILED').length;
  console.log(
    `[seat-rotation] week=${result.weekKey} rotated=${rotated} skipped=${skipped} failed=${failed}`,
  );
}

export function startWeeklySeatingRotationJob(cronExpression: string): Cron {
  const task = createWeeklySeatingRotationTask(cronExpression);
  const run = async () => logResult(await task.run());

  const job = new Cron(
    task.cronExpression,
    {
      name: 'weekly-seating-rotation',
      timezone: task.timezone,
      protect: true,
      catch: (error) => console.error('[seat-rotation] job error', error),
    },
    run,
  );

  void run().catch((error: unknown) =>
    console.error('[seat-rotation] startup catch-up error', error),
  );
  return job;
}
