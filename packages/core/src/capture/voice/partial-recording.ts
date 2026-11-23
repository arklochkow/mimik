import { MIN_SPEECH_S } from './batching';

export interface RecordingSlice {
  pcm: Int16Array;
  sampleRate: number;
  audioEpochMs: number;
  durationSeconds: number;
}

export function partialRecording(
  recording: RecordingSlice,
  fromSeconds: number,
  toSeconds: number,
): RecordingSlice | null {
  const { pcm, sampleRate, audioEpochMs } = recording;
  const from = Math.max(0, Math.floor(fromSeconds * sampleRate));
  const to = Math.min(pcm.length, Math.floor(toSeconds * sampleRate));
  if (to - from < MIN_SPEECH_S * sampleRate) return null;

  return {
    pcm: pcm.slice(from, to),
    sampleRate,
    audioEpochMs: audioEpochMs + Math.round((from / sampleRate) * 1000),
    durationSeconds: (to - from) / sampleRate,
  };
}
