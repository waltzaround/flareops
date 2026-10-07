import { it, expect, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: any, public env: any) {} } }));
vi.mock('@cloudflare/computer', () => ({ Workspace: class {} }));
vi.mock('@cloudflare/computer/git', () => ({ createGitClient: () => ({}) }));
vi.mock('@cloudflare/computer/backends/worker-shell', () => ({ WorkerShellBackend: class {} }));
vi.mock('@cloudflare/computer/backends/container', () => ({ withWorkspaceContainer: (base: any) => base, CloudflareContainerBackend: class {} }));
import { Computer } from './computer';
it('destroys the container and clears its cleanup alarm after success', async () => {
  const ctx = { id: 'test', storage: { setAlarm: vi.fn(), deleteAlarm: vi.fn() }, container: { destroy: vi.fn() } };
  const computer = new Computer(ctx as any, {} as any, 'AGENTS');
  await (computer as any).shutdown();
  expect(ctx.container.destroy).toHaveBeenCalledOnce();
  expect(ctx.storage.deleteAlarm).toHaveBeenCalledOnce();
});
it('retains a scheduled cleanup retry when container shutdown fails', async () => {
  const ctx = { id: 'test', storage: { setAlarm: vi.fn(), deleteAlarm: vi.fn() }, container: { destroy: vi.fn().mockRejectedValue(Error('temporary failure')) } };
  const computer = new Computer(ctx as any, {} as any, 'AGENTS');
  await expect((computer as any).shutdown()).rejects.toThrow();
  expect(ctx.storage.setAlarm).toHaveBeenCalledOnce();
  expect(ctx.storage.deleteAlarm).not.toHaveBeenCalled();
});
