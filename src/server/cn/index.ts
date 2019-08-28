import cluster from  'cluster';
import { proxyProcess } from '../net-util/proxy-process';
import { ProxySocket, ProxyTcp } from '../net-util';
import { uuid } from '../util';
import { BrowserManage } from '../util/package-manage';
import { PackageSeparation, PackageUtil } from '../util/package-separation';
import { ProxyUdpServer  } from '../net-util/proxy-udp';
import { ProxyBasic } from '../proxy-basic';

class TcpConnection extends ProxyBasic {
  constructor() {
    super('cn');
    this.createUdpSocket(6800, 6900, 5);
    proxyProcess.on('udp-response-message', this.responseData());
  }

  protected createUdpSocket(port: number, connectPort: number, count: number) {
    super.createUdpSocket(port, connectPort, count);
    this.udpServerList.forEach((server: ProxyUdpServer) => {
      server.on('data', (data: Buffer) => {
        const { uid, buffer } = PackageUtil.getUid(data);
        const { cursor } = PackageUtil.packageSigout(buffer);
        console.log(`-- client pid:${process.pid} length: ${buffer.length} ${cursor} ${uid} --`);
        proxyProcess.responseMessage(data);
      });
    });
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
    const tcpEvent = this.createTcpEvent(uid, '127.0.0.1', 8000);
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
ProxyTcp.createTcpServer(80, new TcpConnection().call());