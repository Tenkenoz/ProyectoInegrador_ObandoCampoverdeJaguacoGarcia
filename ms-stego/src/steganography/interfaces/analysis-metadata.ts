import type { ImageFormat } from './image.js';
import type {
  ChannelEvidence,
  LsbReason,
} from '../lsb/interfaces/lsb-result.js';
import type { LsbConfiguration } from '../lsb/config/lsb.config.js';

export interface AnalysisMetadata {
  original_filename: string;
  format: ImageFormat;
  size_bytes: number;
  width: number;
  height: number;
  reason: LsbReason;
  channels: ChannelEvidence[];
  limitations: string[];
  analyzed_at: string;
  detector_parameters: LsbConfiguration;
}
