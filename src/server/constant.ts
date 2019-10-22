import { getIPv4Address, PLATFORM, LOCSLHOST_DNS } from './util/os-util';
// 采用多核部署
export const IS_CLUSER: boolean = PLATFORM !== 'win32';
// 本机地址
export const LOCALHOST_ADDRESS = getIPv4Address();
// 客户端 ip地址
export const CLIENT_IP: string = LOCALHOST_ADDRESS;
// 服务端 ip地址
export const SERVER_IP: string = '10.248.63.113';
// 客户端udp初始监听端口
export const CLIENT_UDP_INITIAL_PORT: number = 6800;
// 服务端udp初始监听端口
export const SERVER_UDP_INITIAL_PORT: number = 6900;
// 客户端代理 最大udp
export const CLIENT_MAX_UDP_SERVER: number = IS_CLUSER ? 1 : 2;
// 服务端代理 最大udp
export const SERVER_MAX_UDP_SERVER: number = IS_CLUSER ? 2 : 4;
// 客户端tcp http监听端口
export const CLIENT_TCP_HTTP_PORT: number = 80;
// 客户端tcp https监听端口
export const CLIENT_TCP_HTTPS_PORT: number = 443;
// 服务端tcp 监听端口
export const SERVER_TCP_PORT: number = 8000;
// 数据包最大size
export const PACKAGE_MAX_SIZE: number = 3980;
// 客户端 dns 地址
export const CN_DNS_ADDRESS = [ '10.248.33.31', '10.218.2.13' ];
// 服务端 dns 地址
export const EN_DNS_ADDRESS = CN_DNS_ADDRESS;

// 进程通讯事件
export const PROCESS_EVENT_TYPE = {
  UDP_RESPONSE_MESSAGE: 'udp-response-message',
  UDP_REQUEST_MESSAGE: 'udp-request-message',
  DELETE_SOCKETID: 'delete-socket-id',
  BIND_SOCKETID: 'bind-socket-id',
  NOT_UID_PROCESS: 'not-uid-process',
  NOT_SOCKETID_PROCESS: 'not-socket-process',
};

export const SERVER_TYPE = {
  CLIENT: 'Client',
  SERVER: 'Server'
};