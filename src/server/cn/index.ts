import { ProxyTcpSocket, ProxyTcp, proxyProcess } from '../net-util';
import { TcpConnection } from './tcp-connection';
import { AgreementClientUtil } from '../util/agreement-util';
import { TcpConnectionManage } from '../util/tcp-connection-manage';
import { EventEmitter } from '../net-util/event-emitter';
import {
  SERVER_TCP_PORT,
  SERVER_IP,
  CLIENT_TCP_HTTP_PORT,
  CLIENT_UDP_INITIAL_PORT,
  CLIENT_MAX_UDP_SERVER,
  SERVER_TYPE,
} from '../constant';

class ListenerClient extends EventEmitter {
  private socketID: string;
  private agreement: AgreementClientUtil = new AgreementClientUtil(SERVER_IP, SERVER_TCP_PORT, this.connectListener.bind(this));
  private tcpConnectionManage: TcpConnectionManage = new TcpConnectionManage(CLIENT_UDP_INITIAL_PORT, CLIENT_MAX_UDP_SERVER, SERVER_TYPE.CLIENT);
  constructor() {
    super();
  }

  connectListener(socket: ProxyTcpSocket, serverInfo: any) {
    const { socketID, serverUdpInitialPort, serverMaxUdpServer } = serverInfo;
    const tcpConnection = new TcpConnection(socketID);
    
    tcpConnection.initUdpClient(serverUdpInitialPort, serverMaxUdpServer);
    tcpConnection.createEventTcp(socket);
    this.tcpConnectionManage.setTcpConnection(socketID, tcpConnection);
    this.socketID = socketID;
  }
  
  call = (port: number) => (clientSocket: ProxyTcpSocket) => {
    const tcpConnection = this.tcpConnectionManage.getTcpConnect(this.socketID) as TcpConnection;
    
    if (!tcpConnection || !this.socketID) {
      return clientSocket.destroy();
    }
    tcpConnection.call(port)(clientSocket);
  }
}

const client = new ListenerClient();
const http = ProxyTcp.createTcpServer(CLIENT_TCP_HTTP_PORT, client.call(CLIENT_TCP_HTTP_PORT));
const https = ProxyTcp.createTcpServer(443, client.call(443));
