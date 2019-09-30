import { DomainNameObject } from './notice';
import { hasOwnProperty } from '../util';
import { LOCALHOST_ADDRESS } from '../constant';

const proxy = {
  '*.baidu.com': LOCALHOST_ADDRESS,
  '*.bdstatic.com': LOCALHOST_ADDRESS,
  '*.bilibili.com': LOCALHOST_ADDRESS
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

export const getProxyAddress = (questionName: string, domain: DomainNameObject): DomainNameObject | boolean => {
  const { name, type, class: kClass } = domain;
  const parts = questionName.split('.');
  let rdata;
  if (name === 'localhost' || /^\d{3}\.\d{3}\.\d{3}\.\d{3}$/.test(questionName) || domain.class !== 1) {
    return domain;
  }

  if (hasOwnProperty(proxy, questionName)) {
    rdata = encodeAddress(proxy[questionName]);
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

  if (rdata && type == 1 && kClass === 1) {
    return { ...domain, rdata } as DomainNameObject;
  }
  return domain.type === 28 ? false : domain;
}
