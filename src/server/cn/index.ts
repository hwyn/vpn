import { ProxySocket, ProxyTcp } from '../net-util';
import { TcpConnection } from './tcp-connection';
import { AgreementUtil } from '../util/agreement-util';
import { 
  SERVER_TCP_PORT,
  SERVER_IP,
  CLIENT_TCP_HTTP_PORT,
} from '../constant';

const tcpEvent = ProxySocket.createSocketClient(SERVER_IP, SERVER_TCP_PORT, true);

tcpEvent.once('connect', () => {
  const tcpConnection = new TcpConnection();
  tcpConnection.createEventTcp(tcpEvent);
  const http = ProxyTcp.createTcpServer(CLIENT_TCP_HTTP_PORT, tcpConnection.call(CLIENT_TCP_HTTP_PORT));
  const https = ProxyTcp.createTcpServer(443, tcpConnection.call(443));
});
