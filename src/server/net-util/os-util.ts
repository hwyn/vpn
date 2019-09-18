import os, { NetworkInterfaceInfo } from 'os';

const getLocahostInterface = (() => {
  let _interface: NetworkInterfaceInfo;
  return (): NetworkInterfaceInfo => {
    if (_interface) return _interface;
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).some((key: string) => interfaces[key].some((interfaceItem: NetworkInterfaceInfo) => {
      if(interfaceItem.family === 'IPv4' && interfaceItem.address !== '127.0.0.1' && !interfaceItem.internal) {
        _interface = interfaceItem;
        return true;
      }
    }));
    return _interface;
  };
})();

export const getLocalhostIP = (): string => getLocahostInterface().address;
