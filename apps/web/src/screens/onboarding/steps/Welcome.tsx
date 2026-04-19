/**
 * Step 01 · Welcome. Static intro card — introduces the app, the three
 * things it does, and a "bring your own" disclaimer seal. No user input
 * beyond clicking Continue, so the parent can leave `canNext` at `true`.
 */

interface BulletProps {
  kanji: string;
  title: React.ReactNode;
  body: string;
}

const Bullet = ({ kanji, title, body }: BulletProps) => (
  <div className="flex items-start gap-4 rounded-lg border border-border bg-card/35 p-4">
    <span className="font-display text-4xl leading-none text-primary">{kanji}</span>
    <div className="flex flex-col gap-1">
      <b className="font-display text-base text-foreground">{title}</b>
      <span className="text-sm leading-relaxed text-muted-foreground">{body}</span>
    </div>
  </div>
);

export const Welcome = () => (
  <div className="mx-auto flex w-full max-w-[920px] flex-col gap-8">
    {/* Eyebrow */}
    <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
      <span className="font-display text-lg text-primary">迎</span>
      <span>step 01 · welcome</span>
      <span className="h-1 w-1 rounded-full bg-muted/50" />
      <span>挨拶</span>
    </div>

    {/* Title */}
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-5xl leading-tight text-foreground">
        Welcome. <em className="not-italic text-primary">The kettle&apos;s on.</em>
      </h1>
      <p className="max-w-[680px] text-base leading-relaxed text-muted-foreground">
        MoeKoder is a tiny Windows app that burns subtitles into video files —{' '}
        <b className="text-foreground">one MKV, one ASS, one MP4 out the other side</b>. Takes about
        ninety seconds to set up, then it&apos;s out of your way. Here&apos;s what you&apos;re
        getting into.
      </p>
    </div>

    {/* Three bullets + seal */}
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col gap-3">
        <Bullet
          kanji="焼"
          title={
            <>
              <em className="not-italic text-primary">Burns</em> subtitles into video
            </>
          }
          body="One MKV + one ASS → one MP4, with the subs baked into the pixels. No external font packs needed on the receiving end."
        />
        <Bullet
          kanji="速"
          title={
            <>
              Uses your <em className="not-italic text-primary">GPU</em>
            </>
          }
          body="NVENC, Quick Sync, or AMF — whichever you have. 6–12× real-time on a modern card. Your CPU stays free."
        />
        <Bullet
          kanji="夜"
          title={
            <>
              Goes <em className="not-italic text-primary">quiet</em> when done
            </>
          }
          body="No sign-in, no cloud, no telemetry. Launches into a dark window, does one job, disappears from your notifications."
        />
      </div>

      <aside className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/25 p-5 text-center">
        <span className="font-display text-6xl leading-none text-primary">持</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          持 · bring your own
        </span>
        <b className="font-display text-xl text-foreground">
          <em className="not-italic text-primary">Bring</em> your own files.
        </b>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          MoeKoder ships with no video, no subs, no content — and never will. You point it at files{' '}
          <b className="text-foreground">you already own</b>, it hands back a burned copy.
          That&apos;s the whole deal.
        </p>
      </aside>
    </div>

    {/* What you'll need */}
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/25 p-5">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-base text-primary">具</span>
        <span>what you&apos;ll need</span>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <li>
          · <b className="text-foreground">~180 MB free disk</b> for the ffmpeg + ffprobe binaries
          (one-time download)
        </li>
        <li>
          · <b className="text-foreground">A network connection</b> for that first fetch — after
          that, every byte stays local
        </li>
        <li>
          · <b className="text-foreground">A minute or two</b> to pick your defaults
        </li>
      </ul>
    </div>
  </div>
);
