import type { ChannelHistogram } from '../interfaces/rgb-histogram.js';

export function collectRgbHistograms(pixels: Uint8Array): ChannelHistogram[] {
  if (!pixels.length || pixels.length % 4 !== 0)
    throw new RangeError('Invalid RGBA pixel data');
  const histograms: ChannelHistogram[] = ['red', 'green', 'blue'].map(
    (channel) => ({
      channel: channel as ChannelHistogram['channel'],
      counts: new Uint32Array(256),
      sampleCount: pixels.length / 4,
      oneCount: 0,
    }),
  );
  for (let offset = 0; offset < pixels.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[offset + channel]!;
      const histogram = histograms[channel]!;
      histogram.counts[value] = histogram.counts[value]! + 1;
      histogram.oneCount += value & 1;
    }
  }
  return histograms;
}
