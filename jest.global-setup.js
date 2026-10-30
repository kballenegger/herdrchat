/**
 * Every test runs in one time zone, and one with daylight saving: the snooze
 * presets (`src/lib/inbox/snooze.ts`) resolve "tomorrow at 9" by the calendar,
 * and on a machine in a zone without DST (Hong Kong, where this was written)
 * their DST test passed whatever the code did. Set here, before the workers
 * start, because a test's own `process.env` is a copy that Date never reads.
 */
module.exports = () => {
  process.env.TZ = 'America/New_York';
};
