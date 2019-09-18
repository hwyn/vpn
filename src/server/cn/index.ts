import { ProxySocket, ProxyTcp, proxyProcess } from '../net-util';
import { TcpConnection } from './tcp-connection';
import { AgreementClientUtil } from '../util/agreement-util';
import { TcpConnectionManage } from '../util/tcp-connection-manage';
import {
  SERVER_TCP_PORT,
  SERVER_IP,
  CLIENT_TCP_HTTP_PORT,
  CLIENT_UDP_INITIAL_PORT,
  CLIENT_MAX_UDP_SERVER,
} from '../constant';


const tcpConnectionManage = new TcpConnectionManage(CLIENT_UDP_INITIAL_PORT, CLIENT_MAX_UDP_SERVER);

tcpConnectionManage.on('udp-message', (buffer: Buffer) => proxyProcess.responseMessage(buffer));
tcpConnectionManage.on('message', (tcpConnection: TcpConnection, buffer: Buffer) => tcpConnection.responseData()(buffer));

const agreement = new AgreementClientUtil(SERVER_IP, SERVER_TCP_PORT, (socket: ProxySocket, serverInfo: any) => {
  const { socketID, serverUdpInitialPort, serverMaxUdpServer } = serverInfo;
  const tcpConnection = new TcpConnection(socketID);
  const http = ProxyTcp.createTcpServer(CLIENT_TCP_HTTP_PORT, tcpConnection.call(CLIENT_TCP_HTTP_PORT));
  const https = ProxyTcp.createTcpServer(443, tcpConnection.call(443));
  
  tcpConnection.initUdpClient(serverUdpInitialPort, serverMaxUdpServer);
  tcpConnection.createEventTcp(socket);
  tcpConnectionManage.setTcpConnection(socketID, tcpConnection);

  tcpConnection.once('close', () => {
    http.close(() => console.info('http close'));
    https.close(() => console.info('https close'));
  });
});