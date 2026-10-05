import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import type { StepKind, VideoChapter } from '@/core/export/video-export';
import { FRAME_FILL } from '@/core/export/video-support';

const RATES = [1, 1.25, 1.5, 2];

const KIND_DOT: Record<StepKind, string> = {
  click: 'bg-accent',
  type: 'bg-violet-light',
  key: 'bg-violet',
  navigate: 'bg-lavender',
  note: 'bg-muted-foreground',
};

interface VideoStepPlayerProps {
  src: string;
  type: 'video/mp4' | 'video/webm';
  chapters: VideoChapter[];
  narrated?: boolean;
}

function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function activeIndex(chapters: VideoChapter[], time: number): number {
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (time >= chapters[i].start) return i;
  }
  return -1;
}

const WAVE_BARS = [3, 7, 4, 8, 5];

function SpokenMark({ talking }: { talking: boolean }) {
  return (
    <span role="img" aria-label={i18n.t('videoPlayer.spoken')} className="mt-1 flex shrink-0 items-center gap-[2px]">
      {WAVE_BARS.map((height, i) => (
        <span
          key={height}
          className={`w-[2px] rounded-[1px] ${talking ? 'animate-talk bg-lavender' : 'bg-lavender/70'}`}
          style={{ height: `${height}px`, animationDelay: talking ? `${i * 90}ms` : undefined }}
        />
      ))}
    </span>
  );
}

function StepList({
  chapters,
  index,
  narrated,
  playing,
  onJump,
}: {
  chapters: VideoChapter[];
  index: number;
  narrated: boolean;
  playing: boolean;
  onJump: (n: number) => void;
}) {
  const list = useRef<HTMLElement>(null);

  useEffect(() => {
    list.current?.querySelectorAll('button')[index]?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  return (
    <aside ref={list} className="w-[228px] shrink-0 overflow-y-auto border-l border-white/10 bg-deep">
      <div className="px-3 pb-2 pt-3 font-mono text-[9px] uppercase tracking-[0.1em] text-white/45">
        {i18n.t('videoPlayer.stepCount', [String(chapters.length)])}
      </div>
      {chapters.map((chapter, i) => (
        <button
          key={chapter.stepId}
          type="button"
          onClick={() => onJump(i)}
          className={`flex w-full items-start gap-2.5 border-l-2 px-3 py-1.5 text-left transition-colors ${
            i === index ? 'border-l-accent bg-white/10' : 'border-l-transparent hover:bg-white/5'
          }`}
        >
          <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${KIND_DOT[chapter.kind]}`} />
          <span className="min-w-0 flex-1 text-[10.5px] leading-snug text-white/80">{chapter.title}</span>
          {narrated && chapter.spoken && <SpokenMark talking={playing && i === index} />}
          <span className="pt-0.5 font-mono text-[9px] tabular-nums text-white/40">{formatClock(chapter.start)}</span>
        </button>
      ))}
    </aside>
  );
}

export default function VideoStepPlayer({ src, chapters, narrated = false }: VideoStepPlayerProps) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(!narrated);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const index = activeIndex(chapters, time);

  const jump = useCallback(
    (i: number) => {
      const chapter = chapters[i];
      if (chapter && video.current) video.current.currentTime = Math.max(0, chapter.start + 0.01);
    },
    [chapters],
  );

  const togglePlay = () => {
    if (!video.current) return;
    if (video.current.paused) void video.current.play();
    else video.current.pause();
  };

  const cycleRate = () => {
    if (video.current) video.current.playbackRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
  };

  const toggleMute = () => {
    if (video.current) video.current.muted = !video.current.muted;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement === root.current) void document.exitFullscreen();
    else void root.current?.requestFullscreen();
  };

  return (
    <div ref={root} className="flex size-full" style={{ backgroundColor: FRAME_FILL }}>
      <div className="relative min-w-0 flex-1">
        <video
          ref={video}
          src={src}
          autoPlay={!narrated}
          muted={!narrated}
          playsInline
          className="size-full object-contain"
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onPause={() => setPaused(true)}
          onPlay={() => setPaused(false)}
          onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        >
          <track kind="captions" />
        </video>

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8 text-white">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={i18n.t(paused ? 'videoPlayer.play' : 'videoPlayer.pause')}
            className="rounded-md p-1 hover:bg-white/15"
          >
            {paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
          </button>

          <button
            type="button"
            disabled={index <= 0}
            onClick={() => jump(index - 1)}
            aria-label={i18n.t('videoPlayer.previousStep')}
            className="rounded-md p-1 hover:bg-white/15 disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            disabled={index < 0 || index >= chapters.length - 1}
            onClick={() => jump(index + 1)}
            aria-label={i18n.t('videoPlayer.nextStep')}
            className="rounded-md p-1 hover:bg-white/15 disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ChevronRight size={16} />
          </button>

          <span className="font-mono text-[11px] tabular-nums text-white/75">
            {formatClock(time)} / {formatClock(duration)}
          </span>

          <span className="flex-1" />

          <button
            type="button"
            onClick={cycleRate}
            aria-label={i18n.t('videoPlayer.speed')}
            className="rounded-md px-1.5 py-1 font-mono text-[11px] tabular-nums hover:bg-white/15"
          >
            {rate}x
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={i18n.t(muted ? 'videoPlayer.unmute' : 'videoPlayer.mute')}
            className="rounded-md p-1 hover:bg-white/15"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={i18n.t(fullscreen ? 'videoPlayer.exitFullscreen' : 'videoPlayer.fullscreen')}
            className="rounded-md p-1 hover:bg-white/15"
          >
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {chapters.length > 0 && (
        <StepList chapters={chapters} index={index} narrated={narrated} playing={!paused} onJump={jump} />
      )}
    </div>
  );
}
