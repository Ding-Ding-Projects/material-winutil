import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  createDefaultTabWorkspaceState,
  parseTabWorkspaceJson,
  serializeTabWorkspaceState,
  type TabWorkspaceState,
} from '../shared/tabs';

interface WorkspaceRuntimeServiceOptions {
  readonly userDataDirectory: string;
}

async function atomicWrite(file: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}

export class WorkspaceRuntimeService {
  private readonly file: string;
  private state: TabWorkspaceState = createDefaultTabWorkspaceState();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: WorkspaceRuntimeServiceOptions) {
    this.file = path.join(options.userDataDirectory, 'workspace-runtime.v1.json');
  }

  async initialize(): Promise<TabWorkspaceState> {
    try { this.state = parseTabWorkspaceJson(await fs.readFile(this.file, 'utf8')); }
    catch { this.state = createDefaultTabWorkspaceState(); }
    await this.persist();
    return this.snapshot();
  }

  snapshot(): TabWorkspaceState { return parseTabWorkspaceJson(serializeTabWorkspaceState(this.state)); }

  async save(value: unknown): Promise<TabWorkspaceState> {
    let source: string;
    if (typeof value === 'string') source = value;
    else {
      try { source = JSON.stringify(value) ?? ''; }
      catch { throw new TypeError('The workspace state is malformed.'); }
    }
    if (source.length === 0) throw new TypeError('The workspace state is malformed.');
    this.state = parseTabWorkspaceJson(source);
    await this.persist();
    return this.snapshot();
  }

  private async persist(): Promise<void> {
    const payload = serializeTabWorkspaceState(this.state);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(() => atomicWrite(this.file, payload));
    await this.writeQueue;
  }
}
