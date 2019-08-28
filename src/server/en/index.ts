import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { ServerManage, PackageSeparation, PackageUtil, Handler } from '../util';
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
      clientSocket.emitSync('link', buffer)
    } else {
      console.log('not ===> clientSocket');
    }
  };

  private connectionListener = () => (tcpEvent: ProxySocket, uid: string, data: Buffer) => {
    const packageSeparation = new PackageSeparation();
    const packageManage = new ServerManage(uid, packageSeparation, this.responseEvent(tcpEvent));
    // const clientProxySocket = ProxySocket.createSocketClient('127.0.0.1', 3001);
    const clientProxySocket = ProxySocket.createSocketClient('127.0.0.1', 4600);
    this.socketMap.set(uid, clientProxySocket);
    proxyProcess.bindUid(uid);

    packageSeparation.on('send', packageManage.sendCall(this.send(uid)));
    packageSeparation.on('separation', packageManage.distributeCall(clientProxySocket, this.socketMap));
    packageSeparation.on('event', this.responseEvent(tcpEvent));

    clientProxySocket.on('link', packageManage.serverDataCall());
    clientProxySocket.on('end', packageManage.endCall(this.socketMap));
    clientProxySocket.on('error', packageManage.errorCall(this.socketMap));
    clientProxySocket.on('close', packageManage.closeCall(this.socketMap));
    clientProxySocket.on('connect', () => packageManage.serverDataCall()(data));
    clientProxySocket.on('data', packageManage.serverLinkCall());
  };

  call = () => (tcpEvent: ProxySocket) => this.createTcpEvent(tcpEvent);
}

ProxyTcp.createTcpServer(SERVER_TCP_PORT, new TcpConnection().call());