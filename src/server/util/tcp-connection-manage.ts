import { proxyProcess } from '../net-util/proxy-process';
import { ProxyBasic } from '../proxy-basic';
import { PROCESS_EVENT_TYPE, SERVER_TYPE } from '../constant';
import { PackageUtil } from './package-util';
import { createUdpServer, ProxyUdpServer } from '../net-util/proxy-udp';
import { EventEmitter } from '../net-util/event-emitter';

const { UDP_REQUEST_MESSAGE, UDP_RESPONSE_MESSAGE  } = PROCESS_EVENT_TYPE;

export class TcpConnectionManage extends EventEmitter {
  private connection: Map<string, ProxyBasic> = new Map();
  protected udpServerList: ProxyUdpServer[] = [];
  constructor(initialPort: number, maxServer: number, private type?: string) {
    super();
    this.createUdpServer(initialPort, maxServer);
    this.initProxyProcess();
  }

  /**
   * 初始化进程监听
   */
  protected initProxyProcess() {
    const messageType = this.type === SERVER_TYPE.CLIENT ? UDP_RESPONSE_MESSAGE : UDP_REQUEST_MESSAGE;
    proxyProcess.on(messageType, this.switchMessage.bind(this));
  }

  /**
   * 创建udp 服务器监听
   * @param initialPort 
   * @param maxListenNumber 
   */
  protected createUdpServer(initialPort: number, maxListenNumber: number) {
    this.udpServerList = new Array(maxListenNumber).fill(initialPort).map((item: number, index: number) => {
      const udpServer = createUdpServer(item + index);
      udpServer.on('data', this.udpMessage.bind(this));
      return udpServer;
    });
    return this.udpServerList;
  }

  private getClientToConnect(uid: string) {
    let tcpConnection: ProxyBasic;
    this.connection.forEach((val: ProxyBasic) => {
      if (val.hasClient(uid)) tcpConnection = val;
      else if (!tcpConnection) tcpConnection = val;
    });
    return tcpConnection;
  }

  private async getConnecction(data: Buffer): Promise<any> {
    const { uid, buffer } = PackageUtil.getUid(data);
    const tcpConnection = this.getClientToConnect(uid);
    if (tcpConnection) return Promise.resolve({ tcpConnection, uid, buffer });
    else return Promise.reject('tcpConnection not defined');
  }

  private message({ tcpConnection, uid, buffer }: { tcpConnection: any, uid: string, buffer: Buffer }) {
    tcpConnection.agentData(uid, buffer);
  }

  protected udpMessage(data: Buffer) {
    const { uid } = PackageUtil.getUid(data);
    if (this.type === SERVER_TYPE.CLIENT) {
      proxyProcess.responseMessage(data);
    } else {
      proxyProcess.requestMessage(data);
    }
  }

  protected switchMessage(data: Buffer) {
    this.getConnecction(data).then(this.message.bind(this));
  }

  public setTcpConnection(socketID: string, tcpConnection: ProxyBasic) {
    this.connection.set(socketID, tcpConnection);
    tcpConnection.once('close', (socketID: string) => {
      console.log(`close socketID:`, socketID);
      this.connection.delete(socketID);
    });
  }

  public getTcpConnect(socketID: string) {
    return this.connection.get(socketID);
  }
}