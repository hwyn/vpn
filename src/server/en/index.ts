import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { ServerManage, PackageSeparation, PackageUtil, AbnormalManage, getHttp, getHttpsClientHello, EventCommunication, uuid } from '../util';
import { ProxyBasic } from '../proxy-basic';
import { getAddress } from './domain-to-address';
import { 
  SERVER_TCP_PORT,
  SERVER_UDP_INITIAL_PORT,
  SERVER_MAX_UDP_SERVER,
  CLIENT_UDP_INITIAL_PORT,
  PROCESS_EVENT_TYPE,
  CLIENT_IP,
  CLIENT_MAX_UDP_SERVER,
} from '../constant';

const { UDP_REQUEST_MESSAGE, NOT_UID_PROCESS } = PROCESS_EVENT_TYPE;

class TcpConnection extends ProxyBasic {
  constructor() {
    super('en');
    this.createUdpClient(CLIENT_IP, CLIENT_UDP_INITIAL_PORT, CLIENT_MAX_UDP_SERVER);
    this.createUdpServer(SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER);
    proxyProcess.on(UDP_REQUEST_MESSAGE, this.requestData());
  }

  protected udpMessage(data: Buffer): void {
    proxyProcess.requestMessage(data);
  }

  protected responseEvent = (tcpEvent: ProxySocket) => (buffer: Buffer[]) => {
    tcpEvent.write(buffer[0]);
  };

  protected requestData = () => (buffer: Buffer) => {
    const { uid } = PackageUtil.packageSigout(buffer);
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('agent', buffer);
    } else {
      this.notExistUid(uid);
    }
  };

  connectionListener = () => async({ uid, port, host }: any) => {
    try {
      const address = await getAddress(host);

      const clientSocket = ProxySocket.createSocketClient(address, port);
      const packageSeparation = new PackageSeparation();
      const packageManage = new ServerManage(uid, packageSeparation);
      const abnormalManage = new AbnormalManage(uid, packageSeparation);
      const eventCommunication = this.eventCommunication;
      console.log(`--------server connection ${ uid }----------`);
      console.log(`Host: ${host} address: ${address} -- ${port}`);
      
      this.socketMap.set(uid, clientSocket);
      proxyProcess.bindUid(uid);

      packageSeparation.on('sendData', this.send(uid));
      packageSeparation.on('sendEvent', eventCommunication.sendEvent(uid));
      packageSeparation.on('timeout', abnormalManage.endCall());
      packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
      packageSeparation.on('receiveEvent', abnormalManage.message(clientSocket));
      
      clientSocket.on('connect', eventCommunication.createLinkSuccess(uid));
      clientSocket.on('data', packageManage.serverLinkCall());
      clientSocket.on('agent', packageManage.agentRequestCall());
      clientSocket.on('end', abnormalManage.endCall());
      clientSocket.on('close', abnormalManage.closeCall());
      clientSocket.on('error', abnormalManage.errorCall());

      abnormalManage.on('end', () => {
        proxyProcess.deleteUid(uid);
        this.socketMap.delete(uid);
        clientSocket.end();
        console.log('socketMap.size', this.socketMap.size);
      });
    } catch(e) {
      this.eventCommunication.createLinkEror(uid);
    }
  }

  callEvent = () => (eventTcp: ProxySocket) => {
    this.initEventCommunication(new EventCommunication(eventTcp));
    this.eventCommunication.on('link-info', this.requestData());
    this.eventCommunication.on('link', this.connectionListener());
  }
}

ProxyTcp.createTcpServer(SERVER_TCP_PORT, new TcpConnection().callEvent(), true);
