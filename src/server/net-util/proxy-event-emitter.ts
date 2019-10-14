import { EventEmitter, Handler } from './event-emitter';
import { isArray } from '../util/tools';

export class ProxyEventEmitter extends EventEmitter {
  private listenerInfo: Map<string, any> = new Map();
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
      this.listenerInfo.set(event as string, {
        emit,
        isListener: false
      });
    }
  }

  on(key: string, handler: Handler) {
    const removeHandler = super.on(key, handler);
    const listenerInfo = this.listenerInfo.get(key);
    if (listenerInfo && !listenerInfo.isListener) {
      listenerInfo.isListener = true;
      listenerInfo.eventFn = (...arg: any[]) => this[listenerInfo.emit](key, ...arg);
      this.source.on(key, listenerInfo.eventFn);
    }
    return removeHandler;
  }

  remove(key: string, handler: Handler) {
    const result = super.remove(key, handler);
    const listenerInfo = this.listenerInfo.get(key);
    if (this.events[key] && this.events[key].length === 0 && listenerInfo) {
      this.source.removeListener(key, listenerInfo.eventFn);
      listenerInfo.isListener = false;
      delete listenerInfo.eventFn;
    }
    return result;
  }

  /**
   * 方法映射
   */
  protected mappingMethod() {
    (this.mappingFnNames || []).forEach((fnName: string) => 
      this[fnName] = (...arg: any[]) => this.source[fnName](...arg)
    );
  }

  protected mappingAttr(attr: string | string[]): any {
    if (Array.isArray(attr)) {
      return (attr as string[]).forEach((att: string) => this.mappingAttr(att));
    }

    Object.defineProperty(this, attr, {
      get: () => this.source[attr],
      set: (val: any) => this.source[attr] = val,
    });
  }
}
