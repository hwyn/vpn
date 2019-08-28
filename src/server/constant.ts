// 客户端 ip地址
export const CLIENT_IP: string = '127.0.0.1';
// 服务端 ip地址
export const SERVER_IP: string = '127.0.0.1';
// 客户端udp初始监听端口
export const CLIENT_UDP_INITIAL_PORT: number = 6800;
// 服务端udp初始监听端口
export const SERVER_UDP_INITIAL_PORT: number = 6900;
// 客户端代理 最大udp
export const CLIENT_MAX_UDP_SERVER: number = 5;
// 服务端代理 最大udp
export const SERVER_MAX_UDP_SERVER: number = 3;
// 客户端tcp http监听端口
export const CLIENT_TCP_HTTP_PORT: number = 80;
// 客户端tcp https监听端口
export const CLIENT_TCP_HTTPS_PORT: number = 443;
// 服务端tcp 监听端口
export const SERVER_TCP_PORT: number = 8000;

// 数据包最大size
export const PACKAGE_MAX_SIZE: number = 3920;


// 进程通讯事件
export const PROCESS_EVENT_TYPE = {
  UDP_RESPONSE_MESSAGE: 'udp-response-message',
  UDP_REQUEST_MESSAGE: 'udp-request-message',
  DELETE_UID: 'delete-uid',
  BIND_UID: 'bind-uid',
};

// socket通讯事件
export const COMMUNICATION_EVENT: { [key: string]: number } = {
  LINK:0,
  DATA: 1, 
  CLOSE: 2, 
  ERROR: 3, 
  END: 4,
};