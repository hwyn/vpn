import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { uuid, PackageSeparation, PackageUtil, BrowserManage, AbnormalManage, EventCommunication } from '../util';
import { ProxyBasic } from '../proxy-basic';
import { 
  SERVER_TCP_PORT,
  SERVER_UDP_INITIAL_PORT,
  SERVER_MAX_UDP_SERVER,
  SERVER_IP,
  CLIENT_UDP_INITIAL_PORT,
  CLIENT_MAX_UDP_SERVER, 
  CLIENT_TCP_HTTP_PORT,
  PROCESS_EVENT_TYPE,
} from '../constant';

const { UDP_RESPONSE_MESSAGE, NOT_UID_PROCESS, STOU_UID_LINK } = PROCESS_EVENT_TYPE;

class TcpConnection extends ProxyBasic {
  constructor() {
    super('cn');
    this.createUdpClient(SERVER_IP, SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER);
    this.createUdpServer(CLIENT_UDP_INITIAL_PORT, CLIENT_MAX_UDP_SERVER);
    this.createEventTcp(SERVER_IP, SERVER_TCP_PORT);
    proxyProcess.on(UDP_RESPONSE_MESSAGE, this.responseData());
  }

  protected createEventTcp(ip: string, port: number) {
    const tcpEvent = ProxySocket.createSocketClient(ip, port, true);
    this.initEventCommunication(new EventCommunication(tcpEvent))
    this.eventCommunication.on('link-info', this.responseData());
    this.eventCommunication.on('error', () => {
      this.eventCommunication.end();
      this.createEventTcp(SERVER_IP, SERVER_TCP_PORT);
    });
  }

  protected udpMessage(data: Buffer) {
    const { uid, buffer } = PackageUtil.getUid(data);
    const { cursor } = PackageUtil.packageSigout(buffer);
    proxyProcess.responseMessage(data);
  }

  protected notExistUid(uid: string) {
    this.eventCommunication.createStorResponse(uid);
  }

  protected requestEvent = (tcpEvent: ProxySocket) => (buffer: Buffer[]) => {
    const { uid } = PackageUtil.packageSigout(buffer[0]);
    console.log(`--client connection pid:${process.pid}  ${ uid }--`);
    tcpEvent.write(buffer[0]);
  };

  protected responseData = () => (buffer: Buffer) => {
    const { uid, cursor } = PackageUtil.packageSigout(buffer);
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('agent', buffer);
    } else {
      this.notExistUid(uid);
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => (data: Buffer) => {
    const packageSeparation = new PackageSeparation();
    const packageManage = new BrowserManage(uid, packageSeparation);
    const abnormalManage = new AbnormalManage(uid, packageSeparation);
    const eventCommunication = this.eventCommunication;
    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);

    packageSeparation.on('timeout', abnormalManage.errorCall());
    packageSeparation.on('sendData', this.send(uid));
    packageSeparation.on('sendEvent', eventCommunication.sendEvent(uid));
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
    packageSeparation.on('receiveEvent', abnormalManage.message());
    
    clientSocket.on('data', packageManage.clientDataCall());
    clientSocket.on('agent', packageManage.agentResponseCall());
    clientSocket.on('end', abnormalManage.endCall());
    clientSocket.on('close', abnormalManage.closeCall());
    clientSocket.on('error', abnormalManage.errorCall());
    
    abnormalManage.on('end', () => {
      this.socketMap.delete(uid);
      proxyProcess.deleteUid(uid);
      clientSocket.end();
      console.log('socketMap.size', this.socketMap.size);
    });

    packageManage.clientDataCall()(data);
  };

  callEvent = (port: number) => (clientSocket: ProxySocket) => {
    const eventCommunication = this.eventCommunication;
    const defaultUid = uuid();
    clientSocket.once('data', (data: Buffer) => {
      const removeListenerSuccess = eventCommunication.on('link-success', ({ uid }: any) => {
        if (defaultUid === uid) {
          this.connectionListener(uid, clientSocket)(data);
          removeListenerSuccess();
        }
      });
      eventCommunication.createLink(defaultUid, port, data);
    });
  };
}

const tcpConnection = new TcpConnection();

const http = ProxyTcp.createTcpServer(CLIENT_TCP_HTTP_PORT, tcpConnection.callEvent(CLIENT_TCP_HTTP_PORT));
const https = ProxyTcp.createTcpServer(443, tcpConnection.callEvent(443));