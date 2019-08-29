import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { uuid, PackageSeparation, PackageUtil, BrowserManage, AbnormalManage, Handler } from '../util';
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

const { UDP_RESPONSE_MESSAGE } = PROCESS_EVENT_TYPE;

class TcpConnection extends ProxyBasic {
  constructor() {
    super('cn');
    this.createUdpClient(SERVER_IP, SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER);
    this.createUdpServer(CLIENT_UDP_INITIAL_PORT, CLIENT_MAX_UDP_SERVER);
    proxyProcess.on(UDP_RESPONSE_MESSAGE, this.responseData());
  }

  protected udpMessage(data: Buffer) {
    const { uid, buffer } = PackageUtil.getUid(data);
    const { cursor } = PackageUtil.packageSigout(buffer);
    // console.log(`-- client pid:${process.pid} length: ${buffer.length} ${cursor} ${uid} --`);
    proxyProcess.responseMessage(data);
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
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => (data: Buffer) => {
    const tcpEvent = ProxySocket.createSocketClient(SERVER_IP, SERVER_TCP_PORT);
    const packageSeparation = new PackageSeparation();
    const packageManage = new BrowserManage(uid, packageSeparation);
    const abnormalManage = new AbnormalManage(uid, tcpEvent, packageSeparation);
  
    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);

    packageSeparation.once('sendData', this.requestEvent(tcpEvent));
    packageSeparation.on('sendData', this.send(uid));
    packageSeparation.on('sendEvent', abnormalManage.send());
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
    packageSeparation.on('receiveEvent', abnormalManage.message(clientSocket));
    
    tcpEvent.on('data', packageManage.agentResponseCall());
    tcpEvent.on('connect', packageManage.clientLinkCall(data));
    tcpEvent.on('error', () => clientSocket.end());

    clientSocket.on('data', packageManage.clientDataCall());
    clientSocket.on('agent', packageManage.agentResponseCall());
    clientSocket.on('end', abnormalManage.endCall());
    clientSocket.on('close', abnormalManage.closeCall());
    clientSocket.on('error', abnormalManage.errorCall());
    
    abnormalManage.on('end', () => {
      this.socketMap.delete(uid);
      proxyProcess.deleteUid(uid);
      clientSocket.end();
      tcpEvent.end();
    });
  }

  call =  ()  => (clientSocket: ProxySocket) => {
    clientSocket.once('data', this.connectionListener(uuid(), clientSocket));
  };
}
ProxyTcp.createTcpServer(CLIENT_TCP_HTTP_PORT, new TcpConnection().call());