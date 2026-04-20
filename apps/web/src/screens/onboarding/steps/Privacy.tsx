/**
 * Step 08 · Privacy. Static consent-style pledge screen. Five pledges
 * (three "no", two "yes") + a closing seal. `canNext` stays true; the
 * parent swaps the footer CTA to "I understand" via `nextLabel`.
 */

interface PledgeItem {
  k: string;
  tone: 'no' | 'yes';
  title: string;
  body: string;
}

const ITEMS: PledgeItem[] = [
  {
    k: '無',
    tone: 'no',
    title: 'No account, no sign-in, no email',
    body: "MoeKoder doesn't know who you are. There is no server to know who you are.",
  },
  {
    k: '零',
    tone: 'no',
    title: 'Zero telemetry, zero analytics',
    body: 'No events, no crash reports, no "product usage metrics". The only network call is the ffmpeg download you just watched.',
  },
  {
    k: '否',
    tone: 'no',
    title: 'No update nags',
    body: 'Background update checks are off by default. Click Settings → Updates → Check to look for a new version, or flip the toggle there if you want the app to check on its own.',
  },
  {
    k: '自',
    tone: 'yes',
    title: 'Your files stay on your disk',
    body: 'Every byte of every encode is local. No cloud mirror, no temp upload, no "intelligent cache".',
  },
  {
    k: '源',
    tone: 'yes',
    title: 'Open source · MIT',
    body: "Every line of what you're running is on GitHub. Audit it, fork it, strip it for parts.",
  },
];

export const Privacy = () => {
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">静</span>
        <span>step 08 · privacy</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>静</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          One <em className="not-italic text-primary">promise.</em>
        </h1>
        <p className="max-w-[720px] text-sm leading-relaxed text-muted-foreground">
          Read the list. There&apos;s no fine print behind it.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          {ITEMS.map(item => (
            <div
              key={item.k}
              className={
                item.tone === 'no'
                  ? 'flex items-start gap-4 rounded-lg border border-border bg-card/35 p-4'
                  : 'flex items-start gap-4 rounded-lg border border-good/35 bg-good/10 p-4'
              }
            >
              <span
                className={
                  item.tone === 'no'
                    ? 'font-display text-4xl leading-none text-muted-foreground'
                    : 'font-display text-4xl leading-none text-good'
                }
              >
                {item.k}
              </span>
              <div className="flex flex-col gap-1">
                <b className="font-display text-base text-foreground">{item.title}</b>
                <span className="text-sm leading-relaxed text-muted-foreground">{item.body}</span>
              </div>
            </div>
          ))}
        </div>

        <aside className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/25 p-6 text-center">
          <span className="font-display text-[96px] leading-none text-primary">静</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            静 · sei · stillness
          </span>
          <div className="font-display text-xl leading-snug text-foreground">
            Built to be <em className="not-italic text-primary">quiet.</em>
            <br />
            Built to be <em className="not-italic text-primary">gone.</em>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            the pledge · 夜 edition
          </span>
        </aside>
      </div>
    </div>
  );
};
