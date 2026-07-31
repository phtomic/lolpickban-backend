import { CurrentState } from './CurrentState';
import { Session, Summoner } from '../types/lcu';
import { EventEmitter } from 'events';
import logger from '../logging/logger';
import ReplayDataProviderService from './ReplayDataProviderService';
import LeagueDataProviderService from './league/LeagueDataProviderService';
import RemoteDataProviderService from './RemoteDataProviderService';
import GlobalContext from '../GlobalContext';

const log = logger('DataProviderService');

export default interface DataProviderService extends EventEmitter {
  getCurrentData(): Promise<CurrentState | null>;
  cacheSummoners(session: Session): Promise<void>;
  getSummonerById(id: number): Summoner;
}

export const getDataProvider = (): DataProviderService => {
  if (GlobalContext.commandLine.data) {
    const recordingFile = GlobalContext.commandLine.data;
    log.info(`Using recording as data provider service: ${recordingFile}`);
    log.warn('THIS IS PROBABLY MEANT FOR TESTING USAGE ONLY!');
    return new ReplayDataProviderService(recordingFile);
  }

  if (GlobalContext.commandLine.localConnector) {
    log.info('Using local League Client connector (legacy mode — all on one machine).');
    return new LeagueDataProviderService();
  }

  log.info('Using RemoteDataProviderService — waiting for data from lol-connector via POST /ingest.');
  return new RemoteDataProviderService();
};
