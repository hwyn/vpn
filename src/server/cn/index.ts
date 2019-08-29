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

  private createTcpEvent(uid: string, host: string, port: number, data?: Buffer) {
    const tcpEvent = ProxySocket.createSocketClient(host, port);
    tcpEvent.on('data', this.responseData());
    tcpEvent.on('connect', () => console.log('connect===>', `${uid} -- ${host}:${port}`));
    tcpEvent.on('close', () => this.socketMap.delete(uid));
    tcpEvent.on('error', (error: Error) => console.log(error));
    return tcpEvent;
  }

  protected requestEvent = (tcpEvent: ProxySocket) => (buffer: Buffer[]) => {
    const { uid } = PackageUtil.packageSigout(buffer[0]);
    console.log(`--------client connection ${ uid }----------`);
    tcpEvent.write(buffer[0]);
  };

  protected responseData = () => (buffer: Buffer) => {
    const { uid, cursor } = PackageUtil.packageSigout(buffer);
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('link', buffer);
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => (data: Buffer) => {
    const tcpEvent = this.createTcpEvent(uid, SERVER_IP, SERVER_TCP_PORT);
    const packageSeparation = new PackageSeparation();
    const packageManage = new BrowserManage(uid, packageSeparation, this.requestEvent(tcpEvent));
    const abnormalManage = new AbnormalManage(uid, tcpEvent, packageSeparation);
    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);
    tcpEvent.on('connect', () => packageManage.browserLinkCall()(data));

    packageSeparation.on('sendData', packageManage.sendCall(this.send(uid)));
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));

    packageSeparation.on('sendEvent', abnormalManage.send());
    packageSeparation.on('receiveEvent', abnormalManage.message(clientSocket));
    clientSocket.on('link', packageManage.browserDataCall());
    clientSocket.on('data', packageManage.browserLinkCall());

    clientSocket.on('end', abnormalManage.endCall());
    clientSocket.on('close', abnormalManage.closeCall());
    clientSocket.on('error', abnormalManage.errorCall());

    abnormalManage.on('end', () => clientSocket.end());
  }

  call =  ()  => (clientSocket: ProxySocket) => {
    clientSocket.once('data', this.connectionListener(uuid(), clientSocket));
  };
}
ProxyTcp.createTcpServer(CLIENT_TCP_HTTP_PORT, new TcpConnection().call());