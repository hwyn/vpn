import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { ServerManage, PackageSeparation, PackageUtil, Handler, AbnormalManage } from '../util';
import { ProxyBasic } from '../proxy-basic';
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
  constructor() {
    super('en');
    this.createUdpClient(CLIENT_IP, CLIENT_UDP_INITIAL_PORT, CLIENT_MAX_UDP_SERVER);
    this.createUdpServer(SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER);
    proxyProcess.on(UDP_REQUEST_MESSAGE, this.requestData());
  }

  private createTcpEvent(tcpEvent: ProxySocket) {
    tcpEvent.on('link', this.connectionListener());
    tcpEvent.on('data', (buffer: Buffer) => {
      const { uid } = PackageUtil.packageSigout(buffer);
      console.log(`--------server connection ${ uid }----------`);
      tcpEvent.emitSync('link', tcpEvent, uid, buffer);
    });
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
      clientSocket.emitSync('link', buffer);
    } else {
      console.log('not ===> clientSocket');
    }
  };

  private connectionListener = () => (tcpEvent: ProxySocket, uid: string, data: Buffer) => {
    const packageSeparation = new PackageSeparation();
    const packageManage = new ServerManage(uid, packageSeparation, this.responseEvent(tcpEvent));
    // const clientSocket = ProxySocket.createSocketClient('127.0.0.1', 3000);
    const clientSocket = ProxySocket.createSocketClient('127.0.0.1', 4600);
    const abnormalManage = new AbnormalManage(uid, tcpEvent, packageSeparation);

    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);

    packageSeparation.on('sendData', packageManage.sendCall(this.send(uid)));
    packageSeparation.on('sendEvent', this.responseEvent(tcpEvent));
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
    packageSeparation.on('receiveEvent', abnormalManage.message(clientSocket));

    clientSocket.on('link', packageManage.serverDataCall());
    clientSocket.on('connect', () => packageManage.serverDataCall()(data));
    clientSocket.on('data', packageManage.serverLinkCall());

    clientSocket.on('end', abnormalManage.endCall());
    clientSocket.on('close', abnormalManage.closeCall());
    clientSocket.on('error', abnormalManage.errorCall());

    abnormalManage.on('end', () => clientSocket.end())
  };

  call = () => (tcpEvent: ProxySocket) => this.createTcpEvent(tcpEvent);
}

ProxyTcp.createTcpServer(SERVER_TCP_PORT, new TcpConnection().call());