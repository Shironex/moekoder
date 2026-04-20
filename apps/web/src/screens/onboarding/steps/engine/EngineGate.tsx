import { Download } from 'lucide-react';
import { Button } from '@/components/ui';

interface EngineGateProps {
  /** When true, the gate renders "Checking…" and disables the CTA. */
  probing: boolean;
  onInstall: () => void;
}

/**
 * First-launch gate for the Engine onboarding step. Shown before the user
 * confirms the download — split out of the main layout so the "we're about
 * to do a thing" moment is visually distinct from the progress view.
 */
export const EngineGate = ({ probing, onInstall }: EngineGateProps) => (
  <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
    <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
      <span className="font-display text-lg text-primary">引</span>
      <span>step 02 · engine</span>
      <span className="h-1 w-1 rounded-full bg-muted/50" />
      <span>ffmpeg + ffprobe</span>
    </div>

    <div className="flex flex-col gap-3">
      <h1 className="font-display text-4xl leading-tight text-foreground">
        {probing ? (
          <>
            Checking the <em className="not-italic text-primary">engine…</em>
          </>
        ) : (
          <>
            We need a couple of <em className="not-italic text-primary">tools.</em>
          </>
        )}
      </h1>
      <p className="max-w-[640px] text-sm leading-relaxed text-muted-foreground">
        MoeKoder runs on <b className="text-foreground">ffmpeg + ffprobe</b> — the open-source tools
        that decode video, burn subtitles, and mux the output. We fetch the official{' '}
        <b className="text-foreground">BtbN ffmpeg</b> build, verify it, and drop the binaries in
        your AppData. One-time, around <b className="text-foreground">~180 MB</b>, then never again.
      </p>
    </div>

    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-5">
      <div className="flex items-center gap-3">
        <span className="font-display text-3xl leading-none text-primary">具</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="font-display text-base text-foreground">What we&apos;ll install</b>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            destination · %LOCALAPPDATA%\moekoder\bin
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-2 font-mono text-[11.5px] text-muted-foreground">
        <li className="flex items-center gap-3">
          <span className="font-display text-primary">録</span>
          <b className="font-sans text-[13px] text-foreground">ffmpeg.exe</b>
          <span className="text-muted">· encodes video, burns subtitles</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="font-display text-primary">測</span>
          <b className="font-sans text-[13px] text-foreground">ffprobe.exe</b>
          <span className="text-muted">· reads duration, streams, attachments</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="font-display text-primary">印</span>
          <b className="font-sans text-[13px] text-foreground">sha-256 verify</b>
          <span className="text-muted">· tamper check before install</span>
        </li>
      </ul>
    </div>

    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
        {probing ? 'looking for an existing install…' : 'ready when you are'}
      </span>
      <Button variant="primary" size="lg" disabled={probing} onClick={onInstall}>
        <Download size={15} />
        {probing ? 'Checking…' : 'Install ffmpeg'}
      </Button>
    </div>
  </div>
);
