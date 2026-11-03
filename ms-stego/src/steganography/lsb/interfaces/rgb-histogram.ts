export type RgbChannel = 'red' | 'green' | 'blue';

export interface ChannelHistogram {
  channel: RgbChannel;
  counts: Uint32Array;
  sampleCount: number;
  oneCount: number;
}

export interface PairStatistics {
  chiSquare: number;
  eligiblePairs: number;
  includedSamples: number;
  coverage: number;
}
