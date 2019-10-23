import { ProxyTcpSocket } from '../net-util';
import { uuid, PackageUtil, PackageManage, EventCommunication } from '../util';
import { ProxyBasic } from '../proxy-basic';
import {  SERVER_IP, SERVER_TYPE } from '../constant';


export class TcpConnection extends ProxyBasic {
  constructor(socketID: string) {
    super(socketID, 'client');
  }

  public initUdpClient(initialPort: number, maxClientNumber: number) {
    this.createUdpClient(SERVER_IP, initialPort, maxClientNumber);
  }

  public createEventTcp(eventTcp: ProxyTcpSocket) {
    this.initEventCommunication(new EventCommunication(eventTcp));
  }

  connectionListener = (uid: string, clientSocket: ProxyTcpSocket) => (buffer: Buffer) => {
    const packageManage = new PackageManage(uid, SERVER_TYPE.CLIENT);

    packageManage.on('data', (data: Buffer) => clientSocket.write(data));
    packageManage.on('send', (data: Buffer) => this.send(PackageUtil.bindUid(uid, data)));

    packageManage.once('end', () => clientSocket.end());
    packageManage.once('error', (error: Error) => {
      clientSocket.destroy(error);
      this.clientClose(uid);
    });
    packageManage.once('close', () => this.clientClose(uid));

    clientSocket.on('data', (data: Buffer) => packageManage.write(data));
    clientSocket.on('agent', (data: Buffer) => packageManage.distribute(data));

    clientSocket.on('end', () => packageManage.end());
    clientSocket.on('close', () => packageManage.close());
    clientSocket.on('error', (error: Error) => packageManage.error(error));
    clientSocket.on('agentError', () => packageManage.destroy(new Error('This socket has been ended by the other party')));
    packageManage.write(buffer);
  };

  callEvent = (port: number, clientSocket: ProxyTcpSocket) => (data: Buffer) => {
    if (!this.eventCommunication) {
      return clientSocket.destroy(new Error('socket 连接失败'));
    }
    const uid = uuid();
    console.log(`--------client connection ${ uid }----------`);
    this.clientAdd(uid, clientSocket);
    this.eventCommunication.createLink(uid, port, data, (error: Error) => {
      if (error) {
        this.clientClose(uid);
        return clientSocket.destroy(error);
      }
      this.connectionListener(uid, clientSocket)(data);
    });
  };

  call = (port: number) => (clientSocket: ProxyTcpSocket) => {
    clientSocket.once('data', this.callEvent(port, clientSocket));
  };
}