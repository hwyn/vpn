import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { ServerManage, PackageSeparation, PackageUtil, AbnormalManage, EventCommunication } from '../util';
import { ProxyBasic } from '../proxy-basic';
import { getAddress } from './domain-to-address';
import { 
  PROCESS_EVENT_TYPE,
  LOCALHOST_ADDRESS
} from '../constant';
import { UdpServerBasic } from '../udp-server-basic';

const { NOT_UID_PROCESS } = PROCESS_EVENT_TYPE;

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
  public requestData = () => (buffer: Buffer) => {
    const { uid, data, cursor } = PackageUtil.packageSigout(buffer);
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('agent', buffer);
    } else {
      proxyProcess.emitAsync(NOT_UID_PROCESS, uid, UdpServerBasic.writeSocketID(this.socketID, data));
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => async() => {
    const packageSeparation = new PackageSeparation();
    const packageManage = new ServerManage(uid, packageSeparation);
    const abnormalManage = new AbnormalManage(uid, packageSeparation);
    const eventCommunication = this.eventCommunication;
    
    this.socketMap.set(uid, clientSocket);
    packageSeparation.once('timeout', () => clientSocket.end());
    packageSeparation.on('sendData', this.send(uid, clientSocket));
    packageSeparation.on('sendEvent', eventCommunication.sendEvent(uid));
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
    packageSeparation.on('receiveEvent', abnormalManage.message(clientSocket));

    clientSocket.on('data', packageManage.serverLinkCall());
    clientSocket.on('agent', packageManage.agentRequestCall());
    clientSocket.once('end', abnormalManage.endCall());
    clientSocket.once('close', abnormalManage.closeCall());
    clientSocket.once('error', abnormalManage.errorCall());
    abnormalManage.once('close', this.clientClose(uid));
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
