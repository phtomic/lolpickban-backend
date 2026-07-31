import { EventEmitter } from 'events';
import { Session, Summoner } from '../types/lcu';
import { CurrentState } from './CurrentState';
import DataProviderService from './DataProviderService';
import logger from '../logging/logger';

const log = logger('RemoteDataProviderService');

/**
 * DataProvider that receives data pushed from the lol-connector app
 * via POST /ingest — no local polling.
 */
export default class RemoteDataProviderService extends EventEmitter implements DataProviderService {
  private pending: CurrentState | null = null;
  private summoners: Summoner[] = [];

  constructor() {
    super();
    log.info('RemoteDataProviderService ready — waiting for data from lol-connector.');
  }

  // ─── Called by the /ingest route in app.ts ──────────────────────────────────

  /**
   * Accept raw LCU session data pushed by the remote connector.
   */
  ingestState(payload: { isChampSelectActive: boolean; session: Session; summoners?: Summoner[] }): void {
    log.debug(`Received ingest: champSelectActive=${payload.isChampSelectActive}`);

    if (payload.summoners && payload.summoners.length > 0) {
      this.summoners = payload.summoners;
      log.info(`Updated summoner cache: ${this.summoners.length} summoners`);
    }

    this.pending = new CurrentState(payload.isChampSelectActive, payload.session ?? new Session());

    // Notify controller that data is ready (used by RemoteTickManager)
    this.emit('dataReady');
  }

  /**
   * Called when connector reports League Client connection status.
   */
  ingestConnection(connected: boolean): void {
    if (connected) {
      log.info('lol-connector reported: League Client connected.');
      this.emit('connected');
    } else {
      log.info('lol-connector reported: League Client disconnected.');
      this.emit('disconnected');
    }
  }

  // ─── DataProviderService interface ──────────────────────────────────────────

  async getCurrentData(): Promise<CurrentState | null> {
    const state = this.pending;
    this.pending = null;
    return state;
  }

  async cacheSummoners(_session: Session): Promise<void> {
    // Summoners are provided by the connector alongside the session data
    // Nothing to do here
  }

  getSummonerById(id: number): Summoner {
    return this.summoners.filter((s) => s.summonerId === id)[0];
  }
}
