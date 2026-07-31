import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load environmental variables
dotenv.config();

import WebSocketServer from './websocket';
import logger, { setLogLevel } from './logging';
import TickManager from './TickManager';
import { AddressInfo } from 'net';
import State from './state';
import { getDataProvider } from './data/DataProviderService';
import RemoteDataProviderService from './data/RemoteDataProviderService';
import minimist from 'minimist';
import DataDragon from './data/league/DataDragon';
import Controller from './state/Controller';
import GlobalContext from './GlobalContext';
import AutoRecorder from './recording/AutoRecorder';
import './Console';

const argv = minimist(process.argv.slice(2));

GlobalContext.commandLine = {
  data:                 argv['data']                 || '',
  record:               argv['record']               || '',
  leaguePath:           argv['leaguePath']           || '',
  experimentalConnector: !!argv['experimentalConnector'],
  localConnector:       !!argv['localConnector'],
  debug:                !!argv['debug'],
  ingestSecret:         argv['ingestSecret']         || process.env.TOKEN || process.env.INGEST_SECRET || '',
};

if (GlobalContext.commandLine.debug) {
  setLogLevel('debug');
}

const log = logger('main');
const app = express();
app.use(express.json({ limit: '2mb' }));

log.info('  _          _       ____  ___   ____    _   _ ___ ');
log.info(' | |    ___ | |     |  _ \\( _ ) | __ )  | | | |_ _|');
log.info(' | |   / _ \\| |     | |_) / _ \\/\\  _ \\  | | | || | ');
log.info(' | |__| (_) | |___  |  __/ (_>  < |_) | | |_| || | ');
log.info(' |_____\\___/|_____| |_|   \\___/\\/____/   \\___/|___|');

log.debug('Logging in debug mode!');
log.info('Configuration: ' + JSON.stringify({ ...GlobalContext.commandLine, ingestSecret: '***' }));

// ─── JWT middleware for /ingest ──────────────────────────────────────────────

const verifyIngestToken = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const secret = GlobalContext.commandLine.ingestSecret;
  if (!secret) {
    // No secret configured — allow all (development mode)
    log.warn('INGEST_SECRET not configured. /ingest endpoint is UNPROTECTED!');
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    jwt.verify(token, secret);
    next();
  } catch (err) {
    log.warn(`JWT verification failed: ${err}`);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ─── Setup ──────────────────────────────────────────────────────────────────

const state = new State();
const ddragon = new DataDragon(state);
const dataProvider = getDataProvider();
const controller = new Controller({ dataProvider, state, ddragon });
const tickManager = new TickManager({ controller });
const autoRecorder = new AutoRecorder();

// Wire up auto-recording through state events
state.on('champSelectStarted', () => {
  autoRecorder.startSession();
});
state.on('champSelectEnded', () => {
  autoRecorder.endSession();
});
state.on('stateUpdate', () => {
  // Record every time the state meaningfully changes
  if (state.data.champSelectActive) {
    const currentState = { isChampSelectActive: true, session: (state.data as any)._rawSession };
    if (currentState.session) autoRecorder.addDataPoint(currentState as any);
  }
});

// ─── /ingest routes (only relevant when using RemoteDataProviderService) ──────

const remoteProvider = dataProvider instanceof RemoteDataProviderService
  ? (dataProvider as RemoteDataProviderService)
  : null;

app.post('/ingest', verifyIngestToken, (req, res) => {
  if (!remoteProvider) {
    res.status(409).json({ error: 'Backend is not running in remote mode. Start without --localConnector or --data flags.' });
    return;
  }

  const { isChampSelectActive, session, summoners, timestamp } = req.body;

  if (typeof isChampSelectActive !== 'boolean' || session === undefined) {
    res.status(400).json({ error: 'Invalid payload. Required: isChampSelectActive, session' });
    return;
  }

  log.debug(`/ingest received [champSelectActive=${isChampSelectActive}] from connector (ts=${timestamp})`);

  // Store raw session on state for auto-recorder
  if (isChampSelectActive) {
    (state.data as any)._rawSession = session;
  }

  remoteProvider.ingestState({ isChampSelectActive, session, summoners: summoners || [] });

  res.status(200).json({ ok: true });
});

app.post('/ingest/connection', verifyIngestToken, (req, res) => {
  if (!remoteProvider) {
    res.status(409).json({ error: 'Not in remote mode.' });
    return;
  }
  const { connected } = req.body;
  remoteProvider.ingestConnection(!!connected);
  res.status(200).json({ ok: true });
});

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  await ddragon.init();

  const server = http.createServer(app);
  app.use('/cache', express.static(__dirname + '/cache'));
  const wsServer = new WebSocketServer(server, state);
  wsServer.startHeartbeat();

  tickManager.startLoop();

  server.listen(process.env.PORT || 8999, () => {
    if (server.address() === null) {
      return log.error('Failed to start server.');
    }
    const serverAddress = server.address() as AddressInfo;
    return log.info(`Server started on ${JSON.stringify(serverAddress)}`);
  });
};

main().then();
