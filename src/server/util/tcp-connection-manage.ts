import { proxyProcess } from '../net-util/proxy-process';
import { ProxyBasic } from '../proxy-basic';
import { UdpServerBasic } from '../udp-server-basic';
import { PROCESS_EVENT_TYPE } from '../constant';

const { UDP_REQUEST_MESSAGE, UDP_RESPONSE_MESSAGE  } = PROCESS_EVENT_TYPE;

export class TcpConnectionManage extends UdpServerBasic {
  private connection: Map<string, ProxyBasic> = new Map();
  constructor(initialPort: number, maxServer: number) {
    super();
    this.createUdpServer(initialPort, maxServer);
    this.initProxyProcess();
  }

  /**
   * 初始化进程监听
   */
  protected initProxyProcess() {
    proxyProcess.on(UDP_REQUEST_MESSAGE, this.switchMessage.bind(this));
    proxyProcess.on(UDP_RESPONSE_MESSAGE, this.switchMessage.bind(this));
  }

  private async getConnecction(data: Buffer): Promise<any> {
    const { socketID, buffer } = UdpServerBasic.unWriteSocketId(data);
    const tcpConnection = this.getTcpConnect(socketID);
    if (tcpConnection) return Promise.resolve({ tcpConnection, buffer });
    else return Promise.reject('tcpConnection not defined');
  }

  protected udpMessage(data: Buffer) {
    const { socketID } = UdpServerBasic.unWriteSocketId(data);
    this.emitAsync('udp-message', data);
  }

  protected switchMessage(data: Buffer) {
    this.getConnecction(data).then(({ tcpConnection, buffer }) => this.emitAsync('message', tcpConnection, buffer));
  }

  public setTcpConnection(socketID: string, tcpConnection: ProxyBasic) {
    this.connection.set(socketID, tcpConnection);
    proxyProcess.bindSocketId(socketID);
    tcpConnection.once('close', (socketID: string) => {
      console.log(`close socketID:`, socketID);
      proxyProcess.deleteSocketId(socketID);
      this.connection.delete(socketID);
    });
  }

  public getTcpConnect(socketID: string) {
    return this.connection.get(socketID);
  }
}