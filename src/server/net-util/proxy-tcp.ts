import { Server, createServer, Socket } from 'net';
import { ProxyEventEmitter } from './proxy-event-emitter';
import { ProxySocket } from './proxy-socket';

export class ProxyTcp extends ProxyEventEmitter {
  static createTcpServer = (port: number, connectListener: (socket: ProxySocket) => void, openPackage?: boolean) => {
    return new ProxyTcp(port, connectListener, openPackage);
  };

  private tcpServer: Server = this.source as Server;

  constructor(public port: number, private connectListener: (socket: ProxySocket) => void, private openPackage?: boolean) {
    super(createServer());
    this.associatedListener(['listening', 'connection', 'close', 'error'], true);
    this.onInit();
    this.listen(port);
  }

  private onInit() {
    this.on('connection', (socket: Socket) => {
      this.connectListener(new ProxySocket(socket, this.openPackage));
    });
    this.on('listening', () => console.log(`TCP listening ${this.port}`))
  }

  listen(port: number) {
    this.tcpServer.listen(port, () => {});
  }
}
