import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { TcpConnection } from './tcp-connection';
import { AgreementClientUtil } from '../util/agreement-util';
import { TcpConnectionManage } from '../util/tcp-connection-manage';
import { EventEmitter } from '../util/event-emitter';
import {
  SERVER_TCP_PORT,
  SERVER_IP,
  CLIENT_TCP_HTTP_PORT,
  CLIENT_UDP_INITIAL_PORT,
  CLIENT_MAX_UDP_SERVER,
} from '../constant';

class ListenerClient extends EventEmitter {
  private socketID: string;
  private agreement: AgreementClientUtil;
  private tcpConnectionManage: TcpConnectionManage = new TcpConnectionManage(CLIENT_UDP_INITIAL_PORT, CLIENT_MAX_UDP_SERVER, 0);
  constructor() {
    super();
    this.onInit();
  }

  onInit() {
    this.agreement = new AgreementClientUtil(SERVER_IP, SERVER_TCP_PORT, this.connectListener.bind(this));
    this.tcpConnectionManage.on('udp-message', (buffer: Buffer) => proxyProcess.responseMessage(buffer));
    this.tcpConnectionManage.on('message', (tcpConnection: TcpConnection, buffer: Buffer) => {
      tcpConnection.responseData()(buffer);
    });
  }

  connectListener(socket: ProxySocket, serverInfo: any) {
    const { socketID, serverUdpInitialPort, serverMaxUdpServer } = serverInfo;
    const tcpConnection = new TcpConnection(socketID);
    
    tcpConnection.initUdpClient(serverUdpInitialPort, serverMaxUdpServer);
    tcpConnection.createEventTcp(socket);
    this.tcpConnectionManage.setTcpConnection(socketID, tcpConnection);
    this.socketID = socketID;
  }
  
  call = (port: number) => (clientSocket: ProxySocket) => {
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
