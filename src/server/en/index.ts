import { AgreementServerUtil } from '../util/agreement-util';
import { ProxySocket, proxyProcess } from '../net-util';
import { TcpConnection } from './tcp-connection';
import { TcpConnectionManage } from '../util/tcp-connection-manage';
import { SERVER_TCP_PORT, SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER } from '../constant';


const manage = new TcpConnectionManage(SERVER_UDP_INITIAL_PORT, SERVER_MAX_UDP_SERVER);

manage.on('udp-message', (buffer: Buffer) => proxyProcess.requestMessage(buffer));
manage.on('message', (tcpConnection: TcpConnection, buffer: Buffer) => tcpConnection.requestData()(buffer));

const agreement = new AgreementServerUtil(SERVER_TCP_PORT, (socket: ProxySocket, clientInfo: any) => {
  const { socketID, clientUdpInitialPort, clientMaxUdpServer, clientIp } = clientInfo;
  const tcpConnection = new TcpConnection(socketID);
  tcpConnection.initUdpClient(clientIp, clientUdpInitialPort, clientMaxUdpServer);
  tcpConnection.call()(socket);
  manage.setTcpConnection(socketID, tcpConnection);
});
