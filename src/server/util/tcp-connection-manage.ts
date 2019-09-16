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

  private getConnecction(data: Buffer) {
    const { socketID, buffer } = this.unWriteSocketId(data);
    const tcpConnection = this.connection.get(socketID);
    return { tcpConnection, buffer };
  }

  protected udpMessage(data: Buffer) {
    const { uid, buffer } = PackageUtil.getUid(data);
    const { socketID } = this.unWriteSocketId(buffer);
    this.emitAsync('udp-message', data);
  }

  protected switchMessage(data: Buffer) {
    const { tcpConnection, buffer } = this.getConnecction(data);
    this.emitAsync('message', tcpConnection, buffer);
  }

  protected notExistUid(uid: string, data: Buffer): void {
    const { tcpConnection, buffer } = this.getConnecction(data);
    tcpConnection.notExistUid(uid, buffer);
  }

  protected stopClient(uid: string, data: Buffer): void {
    const { tcpConnection } = this.getConnecction(data);
    tcpConnection.stopClient(uid);
  }

  public setTcpConnection(socketID: string, tcpConnection: ProxyBasic) {
    this.connection.set(socketID, tcpConnection);
    tcpConnection.once('close', () => {
      console.log(`close socketID:`, socketID);
      this.connection.delete(socketID);
    });
  }
}