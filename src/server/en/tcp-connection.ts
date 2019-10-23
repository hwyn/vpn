import { ProxyTcpSocket } from '../net-util';
import { PackageManage, PackageUtil, EventCommunication } from '../util';
import { ProxyBasic } from '../proxy-basic';
import { getAddress } from './domain-to-address';
import { LOCALHOST_ADDRESS, SERVER_TYPE } from '../constant';

export class TcpConnection extends ProxyBasic {
  constructor(socketID: string) {
    super(socketID, 'server');
  }

  /**
   * 初始化响应udp列表
   * @param host string
   * @param initialPort number
   * @param maxClientNumber number
   */
  public initUdpClient(host: string, initialPort: number, maxClientNumber: number) {
    this.createUdpClient(host, initialPort, maxClientNumber);
  }

  /**
   * 创建tcp事件通讯
   * @param eventTcp ProxyTcpSocket
   */
  public createEventTcp(eventTcp: ProxyTcpSocket) {
    this.initEventCommunication(new EventCommunication(eventTcp));
    this.eventCommunication.on('link', this.callEvent());
  }

  connectionListener = (uid: string, clientSocket: ProxyTcpSocket) => async() => {
    const packageManage = new PackageManage(uid, SERVER_TYPE.SERVER);
    
    packageManage.on('data', (data: Buffer) => clientSocket.write(data));
    packageManage.on('send', (data: Buffer) => this.send(PackageUtil.bindUid(uid, data)));

    packageManage.once('end', () => clientSocket.end());
    packageManage.once('error', (error: Error) => {
      clientSocket.destroy(error);
      this.clientClose(uid);
    });
    packageManage.once('close', () => this.clientClose(uid));

    clientSocket.on('data', (data: Buffer) => packageManage.write(data));
    clientSocket.on('agent', (data: Buffer) => packageManage.distribute(data));

    clientSocket.on('end', () => packageManage.end());
    clientSocket.on('close', () => packageManage.close());
    clientSocket.on('error', (error: Error) => packageManage.error(error));
    clientSocket.on('agentError', () => packageManage.destroy(new Error('This socket has been ended by the other party')));
  }

  callEvent = () => async ({ uid, port, host }: any) => {
    const eventCommunication = this.eventCommunication;
    if (!eventCommunication) return ;
    try {
      const address = await getAddress(host);
      console.log(`--------server connection ${ uid }----------`);
      console.log(`Host: ${host} address: ${address} -- ${port}`);
      if (address === LOCALHOST_ADDRESS || (address === '127.0.0.1' && [80, 443].includes(port))) {
        throw new Error(`address is ${LOCALHOST_ADDRESS}`);
      }
      const clientSocket = ProxyTcpSocket.createSocketClient(address, port);
      this.clientAdd(uid, clientSocket);
      clientSocket.once('connect', this.connectionListener(uid, clientSocket));
      clientSocket.once('connect', eventCommunication.createLinkSuccess(uid));
      clientSocket.once('connect-error', this.eventCommunication.createLinkEror(uid));
      clientSocket.once('connect-error', () => this.clientClose(uid));
    } catch(e) {
      eventCommunication.createLinkEror(uid)();
    }
  }
}
