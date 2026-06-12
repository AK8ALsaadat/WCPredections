type IdleTask = () => Promise<void> | void;
const PRIORITIES = [1, 2, 3, 4];
const queues = new Map<number, IdleTask[]>();
let idleHandle: number | null = null;

function canUseWindow() {
  return typeof window !== "undefined";
}

function scheduleRunner() {
  if (!canUseWindow() || idleHandle !== null) return;

  const runner = (deadline: IdleDeadline) => {
    idleHandle = null;
    runTasks(deadline);
  };

  if (typeof window.requestIdleCallback === "function") {
    idleHandle = window.requestIdleCallback(runner);
  } else {
    idleHandle = window.setTimeout(
      () => runner({ didTimeout: false, timeRemaining: () => 0 }),
      250
    );
  }
}

function runTasks(deadline: IdleDeadline) {
  while (true) {
    const next = dequeueTask();
    if (!next) break;

    try {
      const result = next();
      if (result instanceof Promise) {
        result.catch(() => {});
      }
    } catch {
      // ignore failed prefetch task
    }

    if (deadline.timeRemaining && deadline.timeRemaining() <= 0) {
      break;
    }
  }

  if (hasPendingTasks()) {
    scheduleRunner();
  }
}

function hasPendingTasks() {
  for (const queue of queues.values()) {
    if (queue.length > 0) return true;
  }
  return false;
}

function dequeueTask(): IdleTask | undefined {
  for (const priority of PRIORITIES) {
    const queue = queues.get(priority);
    if (queue && queue.length > 0) {
      return queue.shift();
    }
  }
  return undefined;
}

export function enqueueBackgroundPrefetch(task: IdleTask, priority = 3): void {
  if (!canUseWindow()) return;

  const queue = queues.get(priority) ?? [];
  queue.push(task);
  queues.set(priority, queue);
  scheduleRunner();
}
