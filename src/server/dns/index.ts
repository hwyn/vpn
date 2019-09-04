import { RemoteInfo } from 'dgram';
import { ProxyUdpServer } from '../net-util';
import { Notice, DomainNameObject } from './notice';
import { getProxyAddress } from './proxy.config';
import { CN_DNS_ADDRESS } from '../constant';

// .replace(/([\S]+)/g, '0x$1,')

class DnsServerConnection {
  private idToRinfoMap: Map<number, RemoteInfo> = new Map();

  connectionListener(data: Buffer, rinfo: RemoteInfo) {
    const notice = new Notice(data);
    if (notice.qr === 0) {
      this.idToRinfoMap.set(notice.transactionID, rinfo);
      return dnsServer.write(data, 53, CN_DNS_ADDRESS);
    }

    const answerDomainList: any = notice.answerDomainObject.domains
      .map((item: DomainNameObject) => 
        getProxyAddress(item)
      ).filter((item: any) => !!item).map((item: DomainNameObject) => ({
        ...item,
        ttl: 0
      }));

    const responceBuffer = notice.getResponseNotice(
      notice.questionDomainObject.domains,
      answerDomainList,
      notice.authoritativeDomainObject.domains,
      notice.additionalDomainObject.domains,
    );

    const responseRinfo = this.idToRinfoMap.get(notice.transactionID);
    if (responseRinfo) {
      dnsServer.write(responceBuffer, responseRinfo.port, responseRinfo.address);
      this.idToRinfoMap.delete(notice.transactionID);
    }
  
    const responceNotice = new Notice(responceBuffer);
    // console.log('transactionID', responceNotice.transactionID);
    // console.log('source-question', notice.questionDomainObject);
    // console.log('source-answer', notice.answerDomainObject);
    // console.log('flags', responceNotice.flags);
    // console.log('qr', responceNotice.qr);
    // console.log('opcode', responceNotice.opcode);
    // console.log('aa', responceNotice.aa);
    // console.log('tc', responceNotice.rd);
    // console.log('rd', responceNotice.rd);
    // console.log('ra', responceNotice.ra);
    // console.log('rcode', responceNotice.rcode);
    // console.log('rd', responceNotice.rd);
    // console.log('questionDomainObject', responceNotice.questionDomainObject);
    // console.log('source', notice.answerDomainObject.domains);
    // console.log('answerDomainObject', responceNotice.answerDomainObject.domains);
    // console.log('authoritativeDomainObject', responceNotice.authoritativeDomainObject);
    // console.log('additionalDomainObject', responceNotice.additionalDomainObject);
  }

  call = () => (data: Buffer, rinfo: RemoteInfo) => this.connectionListener(data, rinfo);
}

const dnsServer = new ProxyUdpServer(53);
dnsServer.on('listening', () => console.log(`dns server listening 53 port`));
dnsServer.on('data', new DnsServerConnection().call());
