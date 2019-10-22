/**
 * Created by NX on 2019/8/24.
 */
import { BufferUtil } from '../net-util/buffer-util';

export const globTitleSize: number = 80;

export class PackageUtil {
  static PORT_BYTE_SIZE: 16 = 16;
  static UID_BYTE_SIZE: 8 = 8;

  static bindUid(uid: string, buffer: Buffer) {
    const { UID_BYTE_SIZE } = PackageUtil;
    const title = BufferUtil.writeGrounUInt([uid.length], [UID_BYTE_SIZE]);
    return BufferUtil.concat(title, uid, buffer);
  }

  static getUid(buffer: Buffer): { uid: string, buffer: Buffer} {
    const { UID_BYTE_SIZE } = PackageUtil;
    const [uidLength] = BufferUtil.readGroupUInt(buffer, [UID_BYTE_SIZE]);
    const [ uid, packageBuf ] = BufferUtil.unConcat(buffer, [uidLength], UID_BYTE_SIZE);
    return { uid: uid.toString(), buffer: packageBuf };
  }
}
