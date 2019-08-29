import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { ServerManage, PackageSeparation, PackageUtil, AbnormalManage, Handler } from '../util';
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
      console.log('not ===> clientSocket');
    }
  };

  private connectionListener = (
    { tcpEvent, packageSeparation, packageManage }: { tcpEvent: ProxySocket, packageSeparation: PackageSeparation, packageManage: ServerManage  }
  ) => ({uid, data: buffer}: { uid: string, data: Buffer}) => {
    // const clientSocket = ProxySocket.createSocketClient('127.0.0.1', 3000);
    console.log(`--------server connection ${ uid }----------`);
    const match = buffer.toString().match(/([^\r\n]+)/g);
    console.log(`${match[0]} -- ${match[1]}`);

    const clientSocket = ProxySocket.createSocketClient('127.0.0.1', 4600);
    const abnormalManage = new AbnormalManage(uid, tcpEvent, packageSeparation);

    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindUid(uid);

    packageSeparation.on('sendData', this.send(uid));
    packageSeparation.on('sendEvent', this.responseEvent(tcpEvent));
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
    packageSeparation.on('receiveEvent', abnormalManage.message(clientSocket));

    tcpEvent.on('data', packageManage.agentRequestCall());
    tcpEvent.on('error', () => clientSocket.end());

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
}

ProxyTcp.createTcpServer(SERVER_TCP_PORT, new TcpConnection().call());