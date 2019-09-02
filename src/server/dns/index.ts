import { RemoteInfo } from 'dgram';
import { ProxyUdpServer } from '../net-util';
import { Notice, DomainNameObject } from './notice';
import { getProxyAddress } from './proxy.config';

// c0 6b 81 83 00 01 00 00 00 01 00 00 04 70 69 70
// 65 03 70 72 64 00 00 1c 00 01 00 00 06 00 01 00
// 00 01 90 00 40 01 61 0c 72 6f 6f 74 2d 73 65 72
// 76 65 72 73 03 6e 65 74 00 05 6e 73 74 6c 64 0c
// 76 65 72 69 73 69 67 6e 2d 67 72 73 03 63 6f 6d
// 00 78 58 df 18 00 00 07 08 00 00 03 84 00 09 3a
// 80 00 01 51 80

// .replace(/([\S]+)/g, '0x$1,')

class DnsServerConnection {
  private idToRinfoMap: Map<number, RemoteInfo> = new Map();

  connectionListener(data: Buffer, rinfo: RemoteInfo) {
    const notice = new Notice(Buffer.from([0xc0, 0x6b, 0x81, 0x83, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x04, 0x70, 0x69, 0x70,
      0x65, 0x03, 0x70, 0x72, 0x64, 0x00, 0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00,
      0x00, 0x01, 0x90, 0x00, 0x40, 0x01, 0x61, 0x0c, 0x72, 0x6f, 0x6f, 0x74, 0x2d, 0x73, 0x65, 0x72,
      0x76, 0x65, 0x72, 0x73, 0x03, 0x6e, 0x65, 0x74, 0x00, 0x05, 0x6e, 0x73, 0x74, 0x6c, 0x64, 0x0c,
      0x76, 0x65, 0x72, 0x69, 0x73, 0x69, 0x67, 0x6e, 0x2d, 0x67, 0x72, 0x73, 0x03, 0x63, 0x6f, 0x6d,
      0x00, 0x78, 0x58, 0xdf, 0x18, 0x00, 0x00, 0x07, 0x08, 0x00, 0x00, 0x03, 0x84, 0x00, 0x09, 0x3a,
      0x80, 0x00, 0x01, 0x51, 0x80]));
    if (notice.qr === 0) {
      this.idToRinfoMap.set(notice.transactionID, rinfo);
      return dnsServer.write(data, 53, '10.248.33.31');
    }

    const answerDomainList: any = notice.answerDomainObject.domains.map((item: DomainNameObject) => {
      return getProxyAddress(item);
    }).filter((item: any) => !!item).map((item: DomainNameObject) => ({
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
    console.log('source-answer', notice.answerDomainObject);

    console.log('transactionID', notice.transactionID);
    // console.log('flags', responceNotice.flags);
    // console.log('qr', responceNotice.qr);
    // console.log('opcode', responceNotice.opcode);
    // console.log('aa', responceNotice.aa);
    // console.log('tc', responceNotice.rd);
    // console.log('rd', responceNotice.rd);
    // console.log('ra', responceNotice.ra);
    // console.log('rcode', responceNotice.rcode);
    // console.log('rd', responceNotice.rd);
    console.log('questionDomainObject', notice.questionDomainObject);
    console.log('answerDomainObject', notice.answerDomainObject);
    console.log('authoritativeDomainObject', notice.authoritativeDomainObject);
    console.log('additionalDomainObject', notice.additionalDomainObject);

    console.log('transactionID', responceNotice.transactionID);
    // console.log('flags', responceNotice.flags);
    // console.log('qr', responceNotice.qr);
    // console.log('opcode', responceNotice.opcode);
    // console.log('aa', responceNotice.aa);
    // console.log('tc', responceNotice.rd);
    // console.log('rd', responceNotice.rd);
    // console.log('ra', responceNotice.ra);
    // console.log('rcode', responceNotice.rcode);
    // console.log('rd', responceNotice.rd);
    console.log('questionDomainObject', responceNotice.questionDomainObject);
    console.log('answerDomainObject', responceNotice.answerDomainObject);
    console.log('authoritativeDomainObject', responceNotice.authoritativeDomainObject);
    console.log('additionalDomainObject', responceNotice.additionalDomainObject);
  }

  call = () => (data: Buffer, rinfo: RemoteInfo) => this.connectionListener(data, rinfo);
}

const dnsServer = new ProxyUdpServer(53);

dnsServer.on('listening', () => console.log(`dns server listening 53 port`));
dnsServer.on('data', new DnsServerConnection().call());
