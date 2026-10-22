/**
 * Production switch for the data-retention cron.
 * Ships false. Production stays off until Mark sets this to true in a later PR,
 * even when DATA_RETENTION_PURGE is on. A code constant, same as USER_RATINGS_PRODUCTION_LAUNCH.
 */
export const DATA_RETENTION_PRODUCTION_LAUNCH: boolean = false
