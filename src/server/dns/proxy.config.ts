import { DomainNameObject } from './notice';
import { hasOwnProperty } from '../util';

const proxy = {
  '*.google.com': '10.248.63.76',
  '*.baidu.com': '10.248.63.76',
};

const encodeAddress = (address: string) => {
  const buf = Buffer.alloc(4);
  const split = address.split(".");
  if (split.length < 4) return false;
	split.forEach((name: string, index: number) => {
    buf[index] = parseInt(name);
  });
	return buf.toString("base64", 0, 4);
}

export const getProxyAddress = (domain: DomainNameObject): DomainNameObject | boolean => {
  const { name } = domain;
  const parts = name.split('.');
  let rdata;
  if (name === 'localhost' || /^\d{3}\.\d{3}\.\d{3}\.\d{3}$/.test(name) || domain.class !== 1) {
    return domain;
  }
  if (hasOwnProperty(proxy, name)) {
    rdata = encodeAddress(proxy[name]);
  } else {
    while (parts.length) {
      parts[0] = '*';
      const address = proxy[parts.join('.')];
      parts.shift();
      if (address) {
        rdata = encodeAddress(address);
        break;
      }
    }
  }

  if (!rdata) {
    return domain;
  }
  if (domain.type === 28) {
    return false;
  }
  return { ...domain, rdata } as DomainNameObject;
}