import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  addNotification,
  createNotificationState,
  NOTIFICATION_LIMITS,
  parseNotificationStateJson,
  serializeNotificationState,
  setNotificationReview,
  type NotificationInput,
  type NotificationReviewState,
  type NotificationState,
} from '../shared/notifications';

const MAX_IDS = 500;

/** Main-process owner of the bounded notification record. Renderer never gets a file path. */
export class NotificationStore {
  private readonly file: string;
  private state: NotificationState | null = null;
  private queue: Promise<void> = Promise.resolve();

  public constructor(userDataDirectory: string) {
    this.file = path.join(userDataDirectory, 'notifications.v1.json');
  }

  public async initialize(): Promise<NotificationState> {
    if (this.state) return this.state;
    try {
      const raw = await fs.readFile(this.file);
      this.state = parseNotificationStateJson(raw);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.state = createNotificationState();
      else this.state = createNotificationState();
    }
    return this.state;
  }

  public async load(): Promise<NotificationState> { return this.initialize(); }

  public async add(input: NotificationInput): Promise<NotificationState> {
    return this.change((state) => addNotification(state, input, Date.now()));
  }

  /**
   * Records a real main-process operation without letting a full notification
   * history turn that already-completed operation into a false failure.  The
   * newest operational fact wins; the oldest retained record is pruned only
   * when the bounded store has reached its declared capacity.
   */
  public async addOperational(input: NotificationInput): Promise<NotificationState> {
    return this.change((state) => {
      const retained = state.entries.length < NOTIFICATION_LIMITS.maxEntries
        ? state
        : Object.freeze({ ...state, entries: Object.freeze(state.entries.slice(0, NOTIFICATION_LIMITS.maxEntries - 1)) });
      return addNotification(retained, input, Date.now());
    });
  }

  public async review(ids: readonly string[], review: NotificationReviewState): Promise<NotificationState> {
    return this.change((state) => {
      const bounded = this.validateIds(ids);
      let next = state;
      for (const id of bounded) {
        try { next = setNotificationReview(next, id, review); } catch (error) {
          if (!(error instanceof RangeError)) throw error;
        }
      }
      return next;
    });
  }

  public async delete(ids: readonly string[]): Promise<NotificationState> {
    return this.change((state) => {
      const target = new Set(this.validateIds(ids));
      return Object.freeze({ ...state, entries: Object.freeze(state.entries.filter((entry) => !target.has(entry.id))) });
    });
  }

  private validateIds(ids: readonly string[]): readonly string[] {
    if (!Array.isArray(ids) || ids.length > MAX_IDS) throw new RangeError('notification id list exceeds its bound.');
    return ids.map((id) => {
      if (typeof id !== 'string' || id.length === 0 || id.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(id)) throw new TypeError('notification id is invalid.');
      return id;
    });
  }

  private async change(mutate: (state: NotificationState) => NotificationState): Promise<NotificationState> {
    let result!: NotificationState;
    this.queue = this.queue.catch(() => undefined).then(async () => {
      const current = await this.initialize();
      result = mutate(current);
      await this.write(result);
      this.state = result;
    });
    await this.queue;
    return result;
  }

  private async write(state: NotificationState): Promise<void> {
    const body = serializeNotificationState(state);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { await fs.rename(temporary, this.file); }
    catch (error) { await fs.rm(temporary, { force: true }); throw error; }
  }
}
