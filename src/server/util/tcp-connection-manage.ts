import { proxyProcess } from '../net-util/proxy-process';
import { ProxyBasic } from '../proxy-basic';
import { UdpServerBasic } from '../udp-server-basic';
import { PROCESS_EVENT_TYPE } from '../constant';
import { PackageUtil } from './package-separation';

const { UDP_REQUEST_MESSAGE, UDP_RESPONSE_MESSAGE } = PROCESS_EVENT_TYPE;

export class TcpConnectionManage extends UdpServerBasic {
  private connection: Map<string, ProxyBasic> = new Map();
  constructor(initialPort: number, maxServer: number) {
    super();
    this.createUdpServer(initialPort, maxServer);
    proxyProcess.on(UDP_REQUEST_MESSAGE, this.switchMessage.bind(this));
    proxyProcess.on(UDP_RESPONSE_MESSAGE, this.switchMessage.bind(this));
    this.initProxyProcess();
  }

  private async getConnecction(data: Buffer): Promise<any> {
    const { socketID, buffer } = this.unWriteSocketId(data);
    const tcpConnection = this.connection.get(socketID);
    if (tcpConnection) return Promise.resolve({ tcpConnection, buffer });
    else return Promise.reject('tcpConnection not defined');
  }

  protected udpMessage(data: Buffer) {
    const { uid, buffer } = PackageUtil.getUid(data);
    const { socketID } = this.unWriteSocketId(buffer);
    this.emitAsync('udp-message', data);
  }

  protected switchMessage(data: Buffer) {
    this.getConnecction(data).then(({ tcpConnection, buffer }) => {
      this.emitAsync('message', tcpConnection, buffer);
    });
  }

  protected notExistUid(uid: string, data: Buffer): void {
    this.getConnecction(data).then(({ tcpConnection, buffer }) => {
      tcpConnection.notExistUid(uid, buffer);
    });
  }

  protected stopClient(uid: string, data: Buffer): void {
    this.getConnecction(data).then(({ tcpConnection, buffer }) => {
      tcpConnection.stopClient(uid);
    });
  }

  public setTcpConnection(socketID: string, tcpConnection: ProxyBasic) {
    this.connection.set(socketID, tcpConnection);
    tcpConnection.once('close', () => {
      console.log(`close socketID:`, socketID);
      this.connection.delete(socketID);
    });
  }

  public getTcpConnect(socketID: string) {
    return this.connection.get(socketID);
  }
}