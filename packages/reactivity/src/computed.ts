import { isFunction } from '@vue/shared'
import {
  type DebuggerEvent,
  type DebuggerOptions,
  EffectFlags,
  type Subscriber,
  activeSub,
  batch,
  refreshComputed,
} from './effect'
import type { Ref } from './ref'
import { warn } from './warning'
import { Dep, type Link, globalVersion } from './dep'
import { ReactiveFlags, TrackOpTypes } from './constants'

declare const ComputedRefSymbol: unique symbol
declare const WritableComputedRefSymbol: unique symbol

interface BaseComputedRef<T, S = T> extends Ref<T, S> {
  [ComputedRefSymbol]: true
  /**
   * @deprecated computed no longer uses effect
   */
  // NOTE: vue3.5 版本, computed 的内部实现, 不再依赖 effect
  effect: ComputedRefImpl
}

export interface ComputedRef<T = any> extends BaseComputedRef<T> {
  readonly value: T
}

export interface WritableComputedRef<T, S = T> extends BaseComputedRef<T, S> {
  [WritableComputedRefSymbol]: true
}

export type ComputedGetter<T> = (oldValue?: T) => T
export type ComputedSetter<T> = (newValue: T) => void

export interface WritableComputedOptions<T, S = T> {
  get: ComputedGetter<T>
  set: ComputedSetter<S>
}

/**
 * @private exported by @vue/reactivity for Vue core use, but not exported from
 * the main vue package
 */
export class ComputedRefImpl<T = any> implements Subscriber {
  /**
   * @internal
   */
  _value: any = undefined
  /**
   * @internal
   */
  readonly dep: Dep = new Dep(this)
  /**
   * @internal
   */
  readonly __v_isRef = true
  // TODO isolatedDeclarations ReactiveFlags.IS_REF
  /**
   * @internal
   */
  readonly __v_isReadonly: boolean
  // TODO isolatedDeclarations ReactiveFlags.IS_READONLY
  // A computed is also a subscriber that tracks other deps
  /**
   * @internal
   */
  deps?: Link = undefined
  /**
   * @internal
   */
  depsTail?: Link = undefined
  /**
   * @internal
   */
  flags: EffectFlags = EffectFlags.DIRTY
  /**
   * @internal
   */
  globalVersion: number = globalVersion - 1
  /**
   * @internal
   */
  isSSR: boolean
  /**
   * @internal
   */
  next?: Subscriber = undefined

  // for backwards compat
  // https://github.com/vuejs/core/pull/4165
  effect: this = this
  // dev only
  onTrack?: (event: DebuggerEvent) => void
  // dev only
  onTrigger?: (event: DebuggerEvent) => void

  /**
   * Dev only
   * @internal
   */
  _warnRecursive?: boolean

  constructor(
    public fn: ComputedGetter<T>,
    private readonly setter: ComputedSetter<T> | undefined,
    isSSR: boolean,
  ) {
    this[ReactiveFlags.IS_READONLY] = !setter
    this.isSSR = isSSR
  }

  /**
   * @internal
   */
  notify(): true | void {
    // 只要 computed 中的 dep 触发的 设置 computed DIRTY 标识
    // 这里特别要注意, 即使 computed 的 dep 更新, 最终 computed 返回的值不一定更新
    // const foo = ref(0)
    // 比如: com = computed(() => Math.max(10, foo))
    // watch(com, () => console.log(com.value))
    // foo.value = 5
    // 这里的 foo.vlaue 更新了, 只是表明 computed 脏了, 但是不一定就表示最终返回的 computed 值有变化
    // 这里的 foo.value 设置为 5, 但是 computed 返回的依然为 10, 并没有变化
    // foo.value = 7 表明 computed 脏了, 但是返回的值依旧为 10 并无变化
    this.flags |= EffectFlags.DIRTY
    if (
      // NOTIFIED 防止追加重发的 sub(Computed)
      !(this.flags & EffectFlags.NOTIFIED) &&
      // effect({
      //   comA {
      //     comA -> 计算属性自己内部 dep 依赖自己, 若是这里不判断 activeSub !== this 的话就会重复进入无限循环
      //     foo.a
      //   }
      // })
      // foo.a - comA.notfiy -> comA.notify -> comA.notify ... 循环
      // avoid infinite self recursion
      activeSub !== this
    ) {
      batch(this, true)
      // 也就是计算属性的依赖更新通过 computed.notify -> computed.dep.notify
      // 通知 父 effect 更新来读取计算属性的 com.value
      // 从而触发计算属性的求值函数, 他不自己更新值, 硬是要父 effect 更新来读取值
      // 这里返回 true, 表示通其订阅的 sub 更新, 从而触发 com.value 读取执行求值函数
      return true
    } else if (__DEV__) {
      // TODO warn
    }
  }

  // effect(() => com.value)
  get value(): T {
    const link = __DEV__
      ? this.dep.track({
          target: this,
          type: TrackOpTypes.GET,
          key: 'value',
        })
      : this.dep.track()
    refreshComputed(this)
    // 只有当 !activeSub || !shouldTrack || activeSub === this.computed 时, link 才不存在
    // if (!activeSub || !shouldTrack || activeSub === this.computed) {
    //   return
    // }
    // sync version after evaluation
    if (link) {
      link.version = this.dep.version
    }
    return this._value
  }

  set value(newValue) {
    if (this.setter) {
      this.setter(newValue)
    } else if (__DEV__) {
      warn('Write operation failed: computed value is readonly')
    }
  }
}

/**
 * Takes a getter function and returns a readonly reactive ref object for the
 * returned value from the getter. It can also take an object with get and set
 * functions to create a writable ref object.
 *
 * @example
 * ```js
 * // Creating a readonly computed ref:
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * console.log(plusOne.value) // 2
 * plusOne.value++ // error
 * ```
 *
 * ```js
 * // Creating a writable computed ref:
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => {
 *     count.value = val - 1
 *   }
 * })
 *
 * plusOne.value = 1
 * console.log(count.value) // 0
 * ```
 *
 * @param getter - Function that produces the next value.
 * @param debugOptions - For debugging. See {@link https://vuejs.org/guide/extras/reactivity-in-depth.html#computed-debugging}.
 * @see {@link https://vuejs.org/api/reactivity-core.html#computed}
 */
export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions,
): ComputedRef<T>
export function computed<T, S = T>(
  options: WritableComputedOptions<T, S>,
  debugOptions?: DebuggerOptions,
): WritableComputedRef<T, S>
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false,
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T> | undefined

  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  const cRef = new ComputedRefImpl(getter, setter, isSSR)

  if (__DEV__ && debugOptions && !isSSR) {
    cRef.onTrack = debugOptions.onTrack
    cRef.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
