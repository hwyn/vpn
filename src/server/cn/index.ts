import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { uuid, PackageSeparation, PackageUtil, BrowserManage, Handler } from '../util';
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
    console.log(`-- client pid:${process.pid} length: ${buffer.length} ${cursor} ${uid} --`);
    proxyProcess.responseMessage(data);
  }

  private createTcpEvent(uid: string, host: string, port: number) {
    const tcpEvent = ProxySocket.createSocketClient(host, port);
    tcpEvent.on('data', this.responseData());
    tcpEvent.on('error', (error: Error) => console.log(error));
    tcpEvent.on('connect', () => console.log('connect===>', `${uid} -- ${host}:${port}`));
    return tcpEvent;
  }

  protected requestEvent = (tcpEvent: ProxySocket) => (buffer: Buffer[]) => {
    const { uid } = PackageUtil.packageSigout(buffer[0]);
    console.log(`--------client connection ${ uid }----------`);
    tcpEvent.write(buffer[0]);
  };

  responseData = () => (buffer: Buffer) => {
    const { uid, cursor } = PackageUtil.packageSigout(buffer);
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('link', buffer);
    }
  };

  connectionListener(serverProxySocket: ProxySocket) {
    const uid = uuid();
    const tcpEvent = this.createTcpEvent(uid, SERVER_IP, SERVER_TCP_PORT);
    const packageSeparation = new PackageSeparation();
    const packageManage = new BrowserManage(uid, packageSeparation, this.requestEvent(tcpEvent));
    this.socketMap.set(uid, serverProxySocket);
    proxyProcess.bindUid(uid);

    packageSeparation.on('send', packageManage.sendCall(this.send(uid)));
    packageSeparation.on('separation', packageManage.distributeCall(serverProxySocket, this.socketMap));
    packageSeparation.on('event', this.requestEvent(tcpEvent));
    
    serverProxySocket.on('link', packageManage.browserDataCall());
    serverProxySocket.on('end', packageManage.endCall(this.socketMap));
    serverProxySocket.on('close', packageManage.closeCall(this.socketMap));
    serverProxySocket.on('error', packageManage.errorCall(this.socketMap));
    serverProxySocket.on('data', packageManage.browserLinkCall());
  }

  call =  ()  => this.connectionListener.bind(this);
}
ProxyTcp.createTcpServer(CLIENT_TCP_HTTP_PORT, new TcpConnection().call());