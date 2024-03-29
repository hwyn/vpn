import { getIPv4Address, PLATFORM, LOCSLHOST_DNS } from './util/os-util';
// 采用多核部署
export const IS_CLUSER: boolean = false; //PLATFORM !== 'win32';
// 本机地址
export const LOCALHOST_ADDRESS = getIPv4Address();
// 客户端 ip地址
export const CLIENT_IP: string = LOCALHOST_ADDRESS;
// 服务端 ip地址
export const SERVER_IP: string = LOCALHOST_ADDRESS;
// 客户端udp初始监听端口
export const CLIENT_UDP_INITIAL_PORT: number = 6800;
// 服务端udp初始监听端口
export const SERVER_UDP_INITIAL_PORT: number = 6900;
// 客户端代理 最大udp
export const CLIENT_MAX_UDP_SERVER: number = 4;
// 服务端代理 最大udp
export const SERVER_MAX_UDP_SERVER: number = 3;
// 客户端tcp http监听端口
export const CLIENT_TCP_HTTP_PORT: number = 80;
// 客户端tcp https监听端口
export const CLIENT_TCP_HTTPS_PORT: number = 443;
// 服务端tcp 监听端口
export const SERVER_TCP_PORT: number = 8000;
// 数据包最大size
export const PACKAGE_MAX_SIZE: number = 3500;
// 客户端 dns 地址
export const CN_DNS_ADDRESS = LOCSLHOST_DNS[0];
// 服务端 dns 地址
export const EN_DNS_ADDRESS = '10.248.33.31';

// 进程通讯事件
export const PROCESS_EVENT_TYPE = {
  UDP_RESPONSE_MESSAGE: 'udp-response-message',
  UDP_REQUEST_MESSAGE: 'udp-request-message',
  DELETE_UID: 'delete-uid',
  BIND_UID: 'bind-uid',
  NOT_UID_PROCESS: 'not-uid-process',
  STOU_UID_LINK: 'stor-uid-link',
};

// socket通讯事件
export const COMMUNICATION_EVENT = {
  LINK: 0,
  DATA: 1, 
  CLOSE: 2, 
  ERROR: 3, 
  END: 4,
};
