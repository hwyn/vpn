import os, { NetworkInterfaceInfo } from 'os';
import { spawn, ChildProcess } from 'child_process';

export const PLATFORM = os.platform();

/**
 * 分平台执行命令
 * @param command 命令
 */
const spawnPlatform = (command: string) => {
  const isWIn32 = PLATFORM === 'win32';
  const spawnArgs: any[] = isWIn32 ? [process.env.ComSpec || 'cmd.exe'] : ['sh'];
  const spawnFlags: any [] = isWIn32 ? ['/d', '/s', '/c'] : ['-c'];
  spawnFlags.push(command);
  spawnArgs.push(spawnFlags);
  const cp = spawn.apply(undefined, spawnArgs) as ChildProcess;
  cp.stderr.on('data', (data: Buffer) => process.stderr.write(data));
  return cp;
}

/**
 * 获取当前网卡信息
 */
const getLocahostInterface = (() => {
  let _interface: any;
  return (): NetworkInterfaceInfo => {
    if (_interface) return _interface;
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).some((key: string) => interfaces[key].some((interfaceItem: NetworkInterfaceInfo) => {
      if(interfaceItem.family === 'IPv4' && interfaceItem.address !== '127.0.0.1' && !interfaceItem.internal) {
        _interface = { ...interfaceItem, device: key };
        return true;
      }
    }));
    return _interface;
  };
})();

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

export const setLocalhostDNS = async (dns: string) => {
  const _interface: any = getLocahostInterface();
  let hardware;
  if (PLATFORM === 'win32') {
    hardware = { HardwarePort: _interface.device };
  } else {
    const hardwares = await getHardware();
    hardware = hardwares.filter((h: any) => h.Device === _interface.device)[0];
  }
  if (!hardware) {
    return () => {};
  }
  const name = hardware.HardwarePort;
  let commandSet: string, commandClear: string;
  if (PLATFORM === 'win32') {
    commandSet = `netsh interface ip set dns "${name}" static ${dns}`;
    commandClear = `netsh interface ip set dns "${name}" dhcp`
  } else {
    commandSet = `networksetup -setdnsservers ${name} ${dns}`;
    commandClear = `networksetup -setdnsservers ${name} empty`
  }
  console.log(commandSet);
  spawnPlatform(commandSet);
  return () => spawnPlatform(commandClear);
};

export const getLocalhostIP = (): string => getLocahostInterface().address;
