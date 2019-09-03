import dns from 'dns';
import { EN_DNS_ADDRESS } from '../constant';

dns.setServers([EN_DNS_ADDRESS]);

export const getAddress = (host: string, isIpv6?: boolean): Promise<string> => {
  console.log(host);
  return new Promise((resolve, reject) => {
    const resolveDns = isIpv6 ? dns.resolve6 : dns.resolve4;
    resolveDns(host, (error, address) => {
      if (error) reject(error);
      else resolve(address[0]);
    })
  });
};