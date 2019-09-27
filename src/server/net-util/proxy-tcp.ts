import { Server, createServer, Socket } from 'net';
import { ProxyEventEmitter } from './proxy-event-emitter';
import { ProxySocket } from './proxy-socket';
import { PackageManage } from '../agreement/package-manage';

export class ProxyTcp extends ProxyEventEmitter {
  static createTcpServer = (port: number, connectListener: (socket: ProxySocket) => void, openPackage?: boolean) => {
    return new ProxyTcp(port, connectListener, openPackage);
  };
  
  private manage: PackageManage;
  private tcpServer: Server = this.source as Server;
  [x: string]: any;

  constructor(public port: number, private connectListener: (socket: ProxySocket) => void, private openPackage?: boolean) {
    super(createServer(), ['close']);
    this.associatedListener(['listening', 'connection', 'close', 'error'], true);
    this.onInit();
    this.listen(port);
  }

  private onInit() {
    this.on('connection', (socket: Socket) => {
      this.connectListener(new ProxySocket(socket, this.openPackage));
    });
    this.on('listening', () => console.log(`TCP listening:: ${this.port}`))
  }

  public resetConnectListener(connectListener: (socket: ProxySocket) => void) {
    this.connectListener = connectListener;
  }

  public listen(port: number) {
    this.tcpServer.listen(port, () => {});
  }
}
