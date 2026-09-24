import { Cron } from 'croner';
import { scorePeriodsService } from './score-periods.service';

export function startScoreSettlementJob(cronExpression: string): Cron {
  const run = async () => {
    const result = await scorePeriodsService.settleAllDuePeriods();
    console.log(
      `[score-settlement] done settled=${result.settled} skipped=${result.skipped} failed=${result.failed}`,
    );
  };
  const job = new Cron(
    cronExpression,
    {
      name: 'score-period-settlement',
      timezone: 'Asia/Taipei',
      protect: true,
      catch: (error) => console.error('[score-settlement] job error', error),
    },
    run,
  );
  void run().catch((error: unknown) =>
    console.error('[score-settlement] startup catch-up error', error),
  );
  return job;
}
