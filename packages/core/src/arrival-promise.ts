// "Get me to Larnaca by 16:00 tomorrow."
//
// An *arrival promise* is a commitment the rider makes and Aloya keeps
// watching: a target arrival time, an origin and a destination. Until the
// rider leaves, a server-side watcher re-plans the trip, recomputes how much
// earlier they should set off given weather, recent route delays, rush hour
// and active disruptions, and nudges them at fixed escalation points.
//
// Everything here is pure so the exact same rules run on the web, in the
// native app and inside the cron worker, and can be unit-tested without a
// database, a clock, or a network. The implementation lives in
// ./arrival-promise/*; this file is the stable public surface.

export * from "./arrival-promise/ladder";
export * from "./arrival-promise/buffer";
export * from "./arrival-promise/nudges";
export * from "./arrival-promise/copy";
