import { ProxySocket } from '../net-util';
import { PackageManage, PackageUtil, EventCommunication } from '../util';
import { ProxyBasic } from '../proxy-basic';
import { getAddress } from './domain-to-address';
import { LOCALHOST_ADDRESS } from '../constant';

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
   * @param eventTcp ProxySocket
   */
  public createEventTcp(eventTcp: ProxySocket) {
    this.initEventCommunication(new EventCommunication(eventTcp));
    this.eventCommunication.on('link-info', this.requestData());
    this.eventCommunication.on('link', this.callEvent());
  }

  /**
   * 发送事件通讯
   */
  protected responseEvent = (tcpEvent: ProxySocket) => (buffer: Buffer[]) => {
    tcpEvent.write(buffer[0]);
  };

  /**
   * 接收到客户端提发送数据
   */
  public requestData = () => (data: Buffer) => {
    const { uid, buffer } = PackageUtil.getUid(data);
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('agent', buffer);
    } else {
      this.notExistUid(uid, buffer);
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => async() => {
    const packageManage = new PackageManage('server');
    const eventCommunication = this.eventCommunication;
    
    this.socketMap.set(uid, clientSocket);

    packageManage.on('data', (data: Buffer) => clientSocket.write(data));
    packageManage.on('send', (data: Buffer) => this.send(clientSocket, PackageUtil.bindUid(uid, data)));

    packageManage.once('end', () => {
      console.log(`--message end ${uid}--`);
      clientSocket.end();
    });
    packageManage.once('error', () => {
      console.log(`--message error ${uid}--`);
      clientSocket.end();
    });
    packageManage.once('timeout', () => {
      console.log(`--message timeout ${uid}--`);
      clientSocket.end();
    });
    packageManage.once('close', () => {
      console.log(`--message close ${uid}--`);
    });
    packageManage.once('close', this.clientClose(uid));

    packageManage.on('sendEnd', (endData: Buffer) => eventCommunication.sendEvent(uid)([PackageUtil.bindUid(uid, endData)]));
    packageManage.on('sendClose', (closeData: Buffer) => eventCommunication.sendEvent(uid)([PackageUtil.bindUid(uid, closeData)]));
    packageManage.on('sendError', (closeData: Buffer) => eventCommunication.sendEvent(uid)([PackageUtil.bindUid(uid, closeData)]));

    clientSocket.on('data', (data: Buffer) => packageManage.write(data));
    clientSocket.on('agent', (data: Buffer) => packageManage.distribute(data));
    clientSocket.on('end', () => packageManage.end(uid));
    clientSocket.on('close', () => packageManage.close(uid));
    clientSocket.on('error', (error: Error) => packageManage.error(uid, error));
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
      const clientSocket = ProxySocket.createSocketClient(address, port);
      clientSocket.once('connect', this.connectionListener(uid, clientSocket));
      clientSocket.once('connect', eventCommunication.createLinkSuccess(uid));
      clientSocket.once('connect-error', this.eventCommunication.createLinkEror(uid));
    } catch(e) {
      eventCommunication.createLinkEror(uid);
    }
  }
}
