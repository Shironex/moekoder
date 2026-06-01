import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@moekoder/shared';
import { isInstalled } from '../../ffmpeg/manager';
import { probeGpu, type GpuProbeResult } from '../../ffmpeg/gpu-probe';
import { IpcError } from '../errors';
import { handle } from '../with-ipc-handler';
import { gpuProbeSchema, gpuProbeResultSchema } from '../schemas/gpu.schemas';
import type { IpcContext } from '../register';

export function registerGpuHandlers(_ctx: IpcContext): void {
  handle<[], GpuProbeResult>(IPC_CHANNELS.GPU_PROBE, gpuProbeSchema, async () => {
    if (!(await isInstalled())) {
      throw new IpcError('UNAVAILABLE', 'ffmpeg must be installed before GPU probe');
    }
    const result = await probeGpu();
    // Validate the outgoing payload — `handle()` only checks args, not the
    // result. Guards the renderer contract against any drift in probeGpu().
    return gpuProbeResultSchema.parse(result) as GpuProbeResult;
  });
}

export function cleanupGpuHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.GPU_PROBE);
}
