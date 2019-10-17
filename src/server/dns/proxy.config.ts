import { DomainNameObject } from './notice';
import { LOCALHOST_ADDRESS } from '../constant';

const ignore = ['*.baidu.com', '*.bdstatic.com', '*.chat.bilibili.com'];

const proxy = {
  // 'adservice.google.com': '127.128.0.69',
  // 'ogs.google.com': '127.128.1.121',
  // 'ssl.gstatic.com': '127.128.0.121',
  // 'www.gstatic.com': '127.128.1.24',
  // 'apis.google.com': '127.128.1.120',
  // '*.google.com': '127.128.0.37',
  '*': LOCALHOST_ADDRESS,
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

const decordAddress = (rdata: string) => {
  const buffer = Buffer.from(rdata, 'base64');
  const address: any = [];
  for(let i = 0; i < buffer.length; i++) {
    address.push(buffer[i]);
  }
  return address.join('.');
}

const dimainIncludes = (domains: string[]) => (domain: string) => {
  const parts = domain.split('.');
  let address;
  if (domains.includes(domain)) {
    address = domain;
  } else {
    while (parts.length) {
      parts[0] = '*';
      if (domains.includes(parts.join('.'))) {
        address = parts.join('.');
        break;
      }
      parts.shift();
    }
  }
  return address;
}

export const hasProxy = dimainIncludes(Object.keys(proxy));

export const hasIgnore = dimainIncludes(ignore);

export const getProxyAddress = (questionName: string, domain: DomainNameObject): DomainNameObject | boolean => {
  const { type, class: kClass } = domain;
  if (!!hasIgnore(questionName) || /^\d{3}\.\d{3}\.\d{3}\.\d{3}$/.test(questionName) || domain.class !== 1) {
    return domain;
  }

  let rdata;
  const address = hasProxy(questionName);
  if (type == 1 && kClass === 1 && !!address && (rdata = proxy[address])) {
    return { ...domain, rdata: encodeAddress(rdata) } as DomainNameObject;
  }

  return domain.type === 28 ? false : domain;
}
