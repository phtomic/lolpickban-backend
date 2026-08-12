import dgram from 'dgram';
import logger from '../logging/logger';

const log = logger('DiscoveryServer');

export default class DiscoveryServer {
  private socket?: dgram.Socket;
  private beaconTimer?: NodeJS.Timeout;
  private port: number;

  constructor(port: number = 8999) {
    this.port = port;
  }

  public start(): void {
    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        log.error(`DiscoveryServer UDP socket error:\n${err.stack}`);
      });

      this.socket.on('message', (msg, rinfo) => {
        const text = msg.toString().trim();
        if (text === 'LOL_PICKBAN_DISCOVER') {
          log.debug(`Discovery request from ${rinfo.address}:${rinfo.port}`);
          this.sendResponse(rinfo.address, rinfo.port);
        }
      });

      this.socket.on('listening', () => {
        if (!this.socket) return;
        this.socket.setBroadcast(true);
        const address = this.socket.address();
        log.info(`LAN Discovery Server running on UDP ${address.address}:${address.port}`);
      });

      this.socket.bind(this.port);

      // Periodically broadcast a beacon on port 8999
      this.beaconTimer = setInterval(() => {
        this.broadcastBeacon();
      }, 3000);

    } catch (err) {
      log.error(`Failed to start DiscoveryServer on port ${this.port}:`, err);
    }
  }

  private sendResponse(targetAddress: string, targetPort: number): void {
    if (!this.socket) return;
    const payload = Buffer.from(
      JSON.stringify({
        service: 'lolpickban-backend',
        port: this.port,
        timestamp: Date.now(),
      })
    );
    this.socket.send(payload, 0, payload.length, targetPort, targetAddress, (err) => {
      if (err) {
        log.debug(`Error sending discovery response to ${targetAddress}:${targetPort}:`, err);
      }
    });
  }

  private broadcastBeacon(): void {
    if (!this.socket) return;
    const payload = Buffer.from(
      JSON.stringify({
        service: 'lolpickban-backend',
        port: this.port,
        beacon: true,
      })
    );
    this.socket.send(payload, 0, payload.length, this.port, '255.255.255.255', (err) => {
      if (err) {
        log.debug('Error sending UDP beacon:', err);
      }
    });
  }

  public stop(): void {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = undefined;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = undefined;
    }
  }
}
