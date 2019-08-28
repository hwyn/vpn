import { EventEmitter } from '../util/event-emitter';
import { isArray } from '../util/tools';

export class ProxyEventEmitter extends EventEmitter {
  constructor(public source: any, protected mappingFnNames?: string[]) {
    super();
    this.mappingMethod();
  }

  /**
   * 添加socket 事件关联
   * @param event string | string[]
   * @param isSync boolean
   */
  protected associatedListener(event: string | string[], isSync?: boolean) {
    if (isArray(event)) {
      (event as string[]).forEach((eve: string) => this.associatedListener(eve, isSync));
    } else {
      const emit = isSync ? 'emitAsync' : 'emitSync';
      this.source.on(event as string, (...arg: any[]) => this[emit](event, ...arg));
    }
  }

  /**
   * 方法映射
   */
  protected mappingMethod() {
    (this.mappingFnNames || []).forEach((fnName: string) => 
      this[fnName] = (...arg: any[]) => this.source[fnName](...arg)
    );
  }
}
