import fs from 'fs-extra';
import path from 'path';
import { CurrentState } from '../data/CurrentState';
import { Summoner } from '../types/lcu';
import RecordingDatapoint from './RecordingDatapoint';
import logger from '../logging/logger';

const log = logger('AutoRecorder');

/**
 * Automatically records every champ-select session to a timestamped file.
 * Files are written to ../recordings/<timestamp>.json
 * No manual --record flag needed.
 */
export default class AutoRecorder {
  private dataPoints: RecordingDatapoint[] = [];
  private summoners: Summoner[] = [];
  private sessionTimestamp: string = '';
  private isRecording = false;
  private readonly recordingsDir: string;

  constructor(recordingsDir = path.resolve(__dirname, '..', '..', 'recordings')) {
    this.recordingsDir = recordingsDir;
    fs.ensureDirSync(this.recordingsDir);
    log.info(`AutoRecorder initialized. Recordings will be saved to: ${this.recordingsDir}`);
  }

  startSession(): void {
    if (this.isRecording) {
      log.warn('AutoRecorder: startSession called while already recording. Saving current session first.');
      this.saveAndReset();
    }

    this.sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.dataPoints = [];
    this.summoners = [];
    this.isRecording = true;

    log.info(`AutoRecorder: session started [${this.sessionTimestamp}]`);
  }

  addDataPoint(state: CurrentState): void {
    if (!this.isRecording) return;
    this.dataPoints.push(
      new RecordingDatapoint(state.isChampSelectActive, state.session, new Date())
    );
  }

  setSummoners(summoners: Summoner[]): void {
    this.summoners = summoners;
  }

  endSession(): void {
    if (!this.isRecording) return;
    log.info(`AutoRecorder: session ended [${this.sessionTimestamp}] — ${this.dataPoints.length} data points.`);
    this.saveAndReset();
  }

  private saveAndReset(): void {
    if (this.dataPoints.length === 0) {
      this.isRecording = false;
      return;
    }

    const filename = path.join(this.recordingsDir, `${this.sessionTimestamp}.json`);

    try {
      fs.writeJsonSync(filename, {
        timestamp: this.sessionTimestamp,
        summoners: this.summoners,
        dataPoints: this.dataPoints,
      });
      log.info(`AutoRecorder: saved → ${filename}`);
    } catch (err) {
      log.error(`AutoRecorder: failed to save ${filename}:`, err);
    }

    this.dataPoints = [];
    this.summoners = [];
    this.sessionTimestamp = '';
    this.isRecording = false;
  }
}
