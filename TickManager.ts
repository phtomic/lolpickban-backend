import logger from './logging/logger';
import Timeout = NodeJS.Timeout;
import Controller from './state/Controller';
import RemoteDataProviderService from './data/RemoteDataProviderService';

const log = logger('tick');

class TickManager {
  controller: Controller;
  timeout?: Timeout;
  tickRate = 1;

  constructor(kwargs: { controller: Controller }) {
    this.controller = kwargs.controller;

    // If using RemoteDataProviderService, also process data immediately on push
    // (in addition to the regular 1s loop which acts as a heartbeat)
    if (this.controller.dataProvider instanceof RemoteDataProviderService) {
      this.controller.dataProvider.on('dataReady', () => this.runLoop());
    }
  }

  startLoop(): void {
    log.info(`Starting main loop with ${1 / this.tickRate} ticks/s!`);
    this.timeout = setInterval(() => this.runLoop(), 1000 / this.tickRate);
  }

  async runLoop(): Promise<void> {
    const newState = await this.controller.dataProvider.getCurrentData();

    if (newState !== null) {
      this.controller.applyNewState(newState);
    }
  }
}

export default TickManager;
