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
      this.send(PackageUtil.bindUid(uid, Buffer.alloc(0)));
    }
  };

  connectionListener = (uid: string, clientSocket: ProxySocket) => (buffer: Buffer) => {
    const packageManage = new PackageManage(uid, 'client');

    this.socketMap.set(uid, clientSocket);
    
    packageManage.on('data', (data: Buffer) => clientSocket.write(data));
    packageManage.on('send', (data: Buffer) => this.send(PackageUtil.bindUid(uid, data)));

    packageManage.once('end', () =>clientSocket.end());
    packageManage.once('error', (error: Error) => clientSocket.destroy(error));
    packageManage.once('close', this.clientClose(uid));

    clientSocket.on('data', (data: Buffer) => packageManage.write(data));
    clientSocket.on('agent', (data: Buffer) => packageManage.distribute(data));

    clientSocket.on('end', () => packageManage.end());
    clientSocket.on('close', () => packageManage.close());
    clientSocket.on('error', (error: Error) => packageManage.error(error));
    clientSocket.on('agentError', () => packageManage.destroy());
    packageManage.write(buffer);
  };

  callEvent = (port: number, clientSocket: ProxySocket) => (data: Buffer) => {
    if (!this.eventCommunication) {
      return clientSocket.destroy(new Error('socket 连接失败'));
    }
    const uid = uuid();
    console.log(`--------client connection ${ uid }----------`);
    this.eventCommunication.createLink(uid, port, data, (error: Error) => {
      if (error) {
        return clientSocket.destroy(error);
      }
      this.connectionListener(uid, clientSocket)(data);
    });
  };

  call = (port: number) => (clientSocket: ProxySocket) => {
    clientSocket.once('data', this.callEvent(port, clientSocket));
  };
}