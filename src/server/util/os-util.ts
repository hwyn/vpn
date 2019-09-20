import os, { NetworkInterfaceInfo } from 'os';
import dns from 'dns';
import { spawn, ChildProcess } from 'child_process';

export const LOCSLHOST_DNS = dns.getServers();

export const PLATFORM = os.platform();

/**
 * 分平台执行命令
 * @param command 命令
 */
const spawnPlatform = (command: string, options?: any) => {
  const isWIn32 = PLATFORM === 'win32';
  const spawnArgs: any[] = isWIn32 ? [process.env.ComSpec || 'cmd.exe'] : ['sh'];
  const spawnFlags: any [] = isWIn32 ? ['/d', '/s', '/c'] : ['-c'];
  spawnFlags.push(command);
  spawnArgs.push(spawnFlags, Object.assign({
    env: Object.assign({}, process.env),
    ...options
  }));
  const cp = spawn.apply(undefined, spawnArgs) as ChildProcess;
  cp.stderr && cp.stderr.on('data', (data: Buffer) => process.stderr.write(data));
  return cp;
}

/**
 * 获取当前网卡信息
 */
const getLocahostInterface = (() => {
  let _interfaceIPv4: any;
  let _interfaceIPv6: any;
  return (isIpv6?: boolean): NetworkInterfaceInfo => {
    const family = isIpv6 ? 'IPv6' : 'IPv4';
    let _interface: any;
    if (isIpv6 && _interfaceIPv6) return _interfaceIPv6;
    if (!isIpv6 && _interfaceIPv4) return _interfaceIPv4;
    const excludeAddress = isIpv6 ? [] : ['127.0.0.1'];
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).some((key: string) => interfaces[key].some((interfaceItem: NetworkInterfaceInfo) => {
      if(interfaceItem.family === family && !excludeAddress.includes(interfaceItem.address) && !interfaceItem.internal) {
        _interface = { ...interfaceItem, device: key };
        return true;
      }
    }));
    isIpv6 ? _interfaceIPv6 = _interface : _interfaceIPv4 = _interface;
    return  _interface;
  };
})();

const setIPDNS = (isIPv6?:boolean) => {
  let commandSet: string;
  let commandClear: string;
  const ipType = isIPv6 ? 'ipv6' : 'ip';
  return (device: string, ipAddress: string) => {
    commandSet = ` netsh interface ${ipType} set dns "${device}" static ${ipAddress} validate=no`;
    commandClear = `netsh interface ${ipType} set dns "${device}" dhcp`;
    spawnPlatform(commandSet).unref();
    return () => spawnPlatform(commandClear, { detached: true, stdio: 'ignore' }).unref();
  }
};

// netsh interface ip set dns "以太网" dhcp && netsh interface ipv6 set dns "以太网" dhcp
const setIPv6DNS = setIPDNS(true);

const setIPv4DNS = setIPDNS();

export const getIPv4Address = () => getLocahostInterface().address;

export const getIPv6Address = () => getLocahostInterface(true).address;

/**
 * 获取网络硬件接口信息
 */
export const getHardware = async (): Promise<any[]> => {
  const hardwareInfo: any = [];
  const cp = spawn('sh', ['-c', `networksetup -listallhardwareports`]);
  cp.stdout.on('data', (data: Buffer) => hardwareInfo.push(data.toString()));
  const res: string = await new Promise(
    (resolve) => cp.on('exit', () => resolve(hardwareInfo.join('')))
  );
  return res.split('\n\n').map((str: string) => {
    const object = {};
    str.split('\n').filter((s: string) => /\S+/.test(s)).forEach((s: string) => s.replace(/^([^:]+):([\S\s]+)/, (a, b, c) => {
      const key = b.replace(/\s*/g, '');
      if (key) {
        object[key] = c.trim();
      }
      return a;
    }));
    return object;
  });
};

export const setLocalhostDNS = async (ipv4: string, ipv6?: string) => {
  const _interface: any = getLocahostInterface();
  let name: string;
  if (PLATFORM === 'win32') {
    name = _interface.device;
  } else {
    const hardwares = await getHardware();
    name = (hardwares.filter((h: any) => h.Device === _interface.device)[0] || {}).HardwarePort;
  }
  if (!name) return () => {};
  if (PLATFORM === 'win32') {
    const clientIPv4 = setIPv4DNS(name, ipv4);
    const clientIPv6 = setIPv6DNS(name, ipv6);
    return () => {
      clientIPv4();
      clientIPv6();
    };
  } else {
    spawnPlatform(`networksetup -setdnsservers ${name} ${ipv6 || ipv4}`).unref();
    return () => spawnPlatform(`networksetup -setdnsservers ${name} empty`, { detached: true, stdio: 'ignore' }).unref();
  }
};
