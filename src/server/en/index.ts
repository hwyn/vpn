import { ProxyTcp } from '../net-util';
import { TcpConnection } from './tcp-connection';
import { 
  SERVER_TCP_PORT,
} from '../constant';

ProxyTcp.createTcpServer(SERVER_TCP_PORT, new TcpConnection().call(), true);
