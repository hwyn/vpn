import { ProxySocket } from '../net-util';
import { uuid, PackageUtil, PackageManage, EventCommunication } from '../util';
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
  public responseData = () => (data: Buffer) => {
    const { uid, buffer} = PackageUtil.getUid(data);
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('agent', buffer);
    } else {
      this.notExistUid(uid, buffer);
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => (data: Buffer) => {
    const packageManage = new PackageManage('client');
    const eventCommunication = this.eventCommunication;

    this.socketMap.set(uid, clientSocket);
    
    packageManage.on('data', (data: Buffer) => clientSocket.write(data));
    packageManage.on('send', (data: Buffer) => this.send(clientSocket, PackageUtil.bindUid(uid, data)));

    packageManage.once('end', () =>clientSocket.end());
    packageManage.once('error', () => clientSocket.end());
    packageManage.once('timeout', () => clientSocket.end());
    packageManage.once('close', this.clientClose(uid));

    packageManage.on('sendEnd', (endData: Buffer) => eventCommunication.sendEvent(uid)([PackageUtil.bindUid(uid, endData)]));
    packageManage.on('sendClose', (closeData: Buffer) => eventCommunication.sendEvent(uid)([PackageUtil.bindUid(uid, closeData)]));
    packageManage.on('sendError', (closeData: Buffer) => eventCommunication.sendEvent(uid)([PackageUtil.bindUid(uid, closeData)]));

    clientSocket.on('data', (data: Buffer) => packageManage.write(data));
    clientSocket.on('agent', (data: Buffer) => packageManage.distribute(data));
    clientSocket.on('end', () => packageManage.end(uid));
    clientSocket.on('close', () => packageManage.close(uid));
    clientSocket.on('error', (error: Error) => packageManage.error(uid, error));
    packageManage.write(data);
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