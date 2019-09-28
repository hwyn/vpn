import { ProxySocket } from '../net-util';
import { uuid, PackageSeparation, PackageUtil, BrowserManage, AbnormalManage, EventCommunication } from '../util';
import { ProxyBasic } from '../proxy-basic';
import {  SERVER_IP } from '../constant';


export class TcpConnection extends ProxyBasic {
  constructor(socketID: string) {
    super(socketID, 'client');
  }

  public initUdpClient(initialPort: number, maxClientNumber: number) {
    this.createUdpClient(SERVER_IP, initialPort, maxClientNumber);
  }

  public createEventTcp(eventTcp: ProxySocket) {
    this.initEventCommunication(new EventCommunication(eventTcp));
    this.eventCommunication.on('link-info', this.responseData());
  }

  /**
   * 接收到服务端响应数据
   */
  public responseData = () => (buffer: Buffer) => {
    const { uid, cursor, data } = PackageUtil.packageSigout(buffer);
    const clientSocket = this.socketMap.get(uid);

    if (clientSocket) {
      clientSocket.emitSync('agent', buffer);
    } else {
      this.notExistUid(uid, buffer);
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => (data: Buffer) => {
    const packageSeparation = new PackageSeparation();
    const packageManage = new BrowserManage(uid, packageSeparation);
    const abnormalManage = new AbnormalManage(uid, packageSeparation);
    const eventCommunication = this.eventCommunication;

    this.socketMap.set(uid, clientSocket);

    packageSeparation.once('timeout', () => clientSocket.end());
    packageSeparation.on('sendData', this.send(uid, clientSocket));
    packageSeparation.on('sendEvent', eventCommunication.sendEvent(uid));
    packageSeparation.on('receiveData', packageManage.distributeCall(clientSocket));
    packageSeparation.on('receiveEvent', abnormalManage.message(clientSocket));
    
    clientSocket.on('data', packageManage.clientDataCall());
    clientSocket.on('agent', packageManage.agentResponseCall());
    clientSocket.once('end', abnormalManage.endCall());
    clientSocket.once('close', abnormalManage.closeCall());
    clientSocket.once('error', abnormalManage.errorCall());
    
    abnormalManage.once('close',this.clientClose(uid));

    packageManage.clientDataCall()(data);
  };

  callEvent = (port: number, clientSocket: ProxySocket) => (data: Buffer) => {
    const uid = uuid();
    if (!this.eventCommunication) {
      return clientSocket.end();
    }
    console.log(`--------client connection ${ uid }----------`);
    this.eventCommunication.createLink(uid, port, data, (error: Error) => {
      if (error) {
        return clientSocket.end();
      }
      this.connectionListener(uid, clientSocket)(data);
    });
  };

  call = (port: number) => (clientSocket: ProxySocket) => {
    clientSocket.once('data', this.callEvent(port, clientSocket));
  };
}