import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { ServerManage, PackageSeparation, PackageUtil, AbnormalManage, EventCommunication } from '../util';
import { ProxyBasic } from '../proxy-basic';
import { getAddress } from './domain-to-address';
import { 
  SERVER_UDP_INITIAL_PORT,
  SERVER_MAX_UDP_SERVER,
  CLIENT_UDP_INITIAL_PORT,
  PROCESS_EVENT_TYPE,
  CLIENT_IP,
  CLIENT_MAX_UDP_SERVER,
  LOCALHOST_ADDRESS
} from '../constant';

const { UDP_REQUEST_MESSAGE, NOT_UID_PROCESS } = PROCESS_EVENT_TYPE;

export class TcpConnection extends ProxyBasic {
  constructor() {
    super('server');
    this.createUdpClient(CLIENT_IP, CLIENT_UDP_INITIAL_PORT, CLIENT_MAX_UDP_SERVER);
    this.createUdpServer(SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER);
    proxyProcess.on(UDP_REQUEST_MESSAGE, this.requestData());
  }

  protected createEventTcp(eventTcp: ProxySocket) {
    this.initEventCommunication(new EventCommunication(eventTcp));
    this.eventCommunication.on('link-info', this.requestData());
  }

  /**
   * udp接收到数据后调用
   * @param data 数据
   */
  protected udpMessage(data: Buffer): void {
    const { uid, buffer } = PackageUtil.getUid(data);
    const { cursor } = PackageUtil.packageSigout(buffer);
    proxyProcess.requestMessage(data);
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
  protected requestData = () => (buffer: Buffer) => {
    const { uid, data, cursor } = PackageUtil.packageSigout(buffer);
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('agent', buffer);
    } else {
      proxyProcess.emitAsync(NOT_UID_PROCESS, uid, data);
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => async() => {
    const packageSeparation = new PackageSeparation();
    const packageManage = new ServerManage(uid, packageSeparation);
    const abnormalManage = new AbnormalManage(uid, packageSeparation);
    const eventCommunication = this.eventCommunication;
    
    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);

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
      if (address === LOCALHOST_ADDRESS) {
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

  call = () => (eventTcp: ProxySocket) => {
    this.createEventTcp(eventTcp);
    this.eventCommunication.on('link', this.callEvent());
  }
}
