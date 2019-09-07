import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { ServerManage, PackageSeparation, PackageUtil, AbnormalManage, getHttp, getHttpsClientHello, EventCommunication } from '../util';
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

const { UDP_REQUEST_MESSAGE } = PROCESS_EVENT_TYPE;

class TcpConnection extends ProxyBasic {
  private eventCommunication: EventCommunication;
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
    console.log(uid, clientSocket);
    if (clientSocket) {
      clientSocket.emitSync('agent', buffer);
    } else {
      console.log('not ===> clientSocket');
    }
  };

  private connectionListener = (
    { tcpEvent, packageSeparation, packageManage }: { tcpEvent: ProxySocket, packageSeparation: PackageSeparation, packageManage: ServerManage  }
  ) => async ({uid, data: portBuffer}: { uid: string, data: Buffer}) => {
    const { port, buffer } = PackageUtil.getPort(portBuffer);
    const { host } = port === 443 ? getHttpsClientHello(buffer) : getHttp(buffer);
    const address = await getAddress(host);
    console.log(`--------server connection ${ uid }----------`);
    console.log(`Host: ${host} address: ${address} -- ${port}`);
    const clientSocket = ProxySocket.createSocketClient(address, port);
    const abnormalManage = new AbnormalManage(uid, tcpEvent, packageSeparation);

    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);

    packageSeparation.on('sendData', this.send(uid));
    packageSeparation.on('sendEvent', this.responseEvent(tcpEvent));
    packageSeparation.on('timeout', abnormalManage.endCall());
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
    packageSeparation.on('receiveEvent', abnormalManage.message());

    tcpEvent.on('data', packageManage.agentRequestCall());
    tcpEvent.on('error', () => abnormalManage.errorCall());

    clientSocket.on('connect', () => clientSocket.write(buffer));
    clientSocket.on('data', packageManage.serverLinkCall());
    clientSocket.on('agent', packageManage.agentRequestCall());
    clientSocket.on('end', abnormalManage.endCall());
    clientSocket.on('close', abnormalManage.closeCall());
    clientSocket.on('error', abnormalManage.errorCall());

    abnormalManage.on('end', () => {
      proxyProcess.deleteUid(uid);
      this.socketMap.delete(uid);
      clientSocket.end();
      tcpEvent.end();
      console.log('socketMap.size', this.socketMap.size);
    });
  }

  call = () => (tcpEvent: ProxySocket) => {
    tcpEvent.once('data', (data: Buffer) => {
      const { uid } = PackageUtil.packageSigout(data);
      const packageSeparation = new PackageSeparation();
      const packageManage = new ServerManage(uid, packageSeparation);
      packageSeparation.once('receiveData', this.connectionListener({ tcpEvent,  packageSeparation, packageManage}));
      packageManage.agentRequestCall()(data);
    });
  }


  linkListener = () => async({ uid, port, host }: any) => {
    const address = await getAddress(host);
    const clientSocket = ProxySocket.createSocketClient(address, port);
    const packageSeparation = new PackageSeparation();
    const packageManage = new ServerManage(uid, packageSeparation);
    const abnormalManage = new AbnormalManage(uid, this.eventCommunication.source, packageSeparation);
    const eventCommunication = this.eventCommunication;
    console.log(`--------server connection ${ uid }----------`);
    console.log(`Host: ${host} address: ${address} -- ${port}`);
    
    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);

    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);

    packageSeparation.on('sendData', this.send(uid));
    // packageSeparation.on('sendEvent', this.responseEvent(tcpEvent));
    packageSeparation.on('timeout', abnormalManage.endCall());
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
    // packageSeparation.on('receiveEvent', abnormalManage.message());

    // tcpEvent.on('data', packageManage.agentRequestCall());
    // tcpEvent.on('error', () => abnormalManage.errorCall());
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
      // tcpEvent.end();
      console.log('socketMap.size', this.socketMap.size);
    });
  }

  callEvent = () => (eventTcp: ProxySocket) => {
    this.eventCommunication = new EventCommunication(eventTcp);
    this.eventCommunication.on('link', this.linkListener());
  }
}

ProxyTcp.createTcpServer(SERVER_TCP_PORT, new TcpConnection().callEvent());
