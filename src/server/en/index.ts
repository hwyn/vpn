import { AgreementServerUtil } from '../util/agreement-util';
import { ProxyTcpSocket, proxyProcess } from '../net-util';
import { TcpConnection } from './tcp-connection';
import { TcpConnectionManage } from '../util/tcp-connection-manage';
import { SERVER_TCP_PORT, SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER, SERVER_TYPE } from '../constant';

const tcpConnectionManage = new TcpConnectionManage(SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER, SERVER_TYPE.SERVER);

const agreement = new AgreementServerUtil(SERVER_TCP_PORT, (socket: ProxyTcpSocket, clientInfo: any) => {
  const { socketID, clientUdpInitialPort, clientMaxUdpServer, clientIp } = clientInfo;
  const tcpConnection = new TcpConnection(socketID);
  tcpConnection.initUdpClient(clientIp, clientUdpInitialPort, clientMaxUdpServer);
  tcpConnection.createEventTcp(socket);
  console.log(`client---- pid: ${process.pid} ------------`, socketID);
  console.log(clientInfo);
  tcpConnectionManage.setTcpConnection(socketID, tcpConnection);
});
