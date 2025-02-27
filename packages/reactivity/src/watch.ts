import {
  EMPTY_OBJ,
  NOOP,
  hasChanged,
  isArray,
  isFunction,
  isMap,
  isObject,
  isPlainObject,
  isSet,
  remove,
} from '@vue/shared'
import { warn } from './warning'
import type { ComputedRef } from './computed'
import { ReactiveFlags } from './constants'
import {
  type DebuggerOptions,
  EffectFlags,
  type EffectScheduler,
  ReactiveEffect,
  pauseTracking,
  resetTracking,
} from './effect'
import { isReactive, isShallow } from './reactive'
import { type Ref, isRef } from './ref'
import { getCurrentScope } from './effectScope'

// 在这句话中，“co-location”指的是“共同定位”或“同地放置”。具体到上下文中，
// 它意味着将某些相关的逻辑或功能放置在同一个地方或模块中，以便于管理和使用。
// 这里提到将某种基础的观察逻辑（base watch logic）移到与@vue/reactivity相关的地方，
// 使得它们可以共同定位，从而改善代码的组织结构和使用效率。
// These errors were transferred from `packages/runtime-core/src/errorHandling.ts`
// to @vue/reactivity to allow co-location with the moved base watch logic, hence
// it is essential to keep these values unchanged.
export enum WatchErrorCodes {
  WATCH_GETTER = 2,
  WATCH_CALLBACK,
  WATCH_CLEANUP,
}

export type WatchEffect = (onCleanup: OnCleanup) => void

export type WatchSource<T = any> = Ref<T, any> | ComputedRef<T> | (() => T)

export type WatchCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  onCleanup: OnCleanup,
) => any

export type OnCleanup = (cleanupFn: () => void) => void

export interface WatchOptions<Immediate = boolean> extends DebuggerOptions {
  immediate?: Immediate
  deep?: boolean | number
  once?: boolean
  scheduler?: WatchScheduler
  onWarn?: (msg: string, ...args: any[]) => void
  /**
   * @internal
   */
  augmentJob?: (job: (...args: any[]) => void) => void
  /**
   * @internal
   */
  call?: (
    fn: Function | Function[],
    type: WatchErrorCodes,
    args?: unknown[],
  ) => void
}

export type WatchStopHandle = () => void

export interface WatchHandle extends WatchStopHandle {
  pause: () => void
  resume: () => void
  stop: () => void
}

// initial value for watchers to trigger on undefined initial values
const INITIAL_WATCHER_VALUE = {}

export type WatchScheduler = (job: () => void, isFirstRun: boolean) => void

const cleanupMap: WeakMap<ReactiveEffect, (() => void)[]> = new WeakMap()
let activeWatcher: ReactiveEffect | undefined = undefined

/**
 * Returns the current active effect if there is one.
 */
export function getCurrentWatcher(): ReactiveEffect<any> | undefined {
  return activeWatcher
}

/**
 * Registers a cleanup callback on the current active effect. This
 * registered cleanup callback will be invoked right before the
 * associated effect re-runs.
 *
 * @param cleanupFn - The callback function to attach to the effect's cleanup.
 * @param failSilently - if `true`, will not throw warning when called without
 * an active effect.
 * @param owner - The effect that this cleanup function should be attached to.
 * By default, the current active effect.
 */
export function onWatcherCleanup(
  cleanupFn: () => void,
  failSilently = false,
  owner: ReactiveEffect | undefined = activeWatcher,
): void {
  if (owner) {
    let cleanups = cleanupMap.get(owner)
    if (!cleanups) cleanupMap.set(owner, (cleanups = []))
    cleanups.push(cleanupFn)
  } else if (__DEV__ && !failSilently) {
    warn(
      `onWatcherCleanup() was called when there was no active watcher` +
        ` to associate with.`,
    )
  }
}

export function watch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb?: WatchCallback | null,
  options: WatchOptions = EMPTY_OBJ,
): WatchHandle {
  const { immediate, deep, once, scheduler, augmentJob, call } = options

  const warnInvalidSource = (s: unknown) => {
    ;(options.onWarn || warn)(
      `Invalid watch source: `,
      s,
      `A watch source can only be a getter/effect function, a ref, ` +
        `a reactive object, or an array of these types.`,
    )
  }

  const reactiveGetter = (source: object) => {
    // traverse will happen in wrapped getter below
    if (deep) return source
    // for `deep: false | 0` or shallow reactive, only traverse root-level properties
    if (isShallow(source) || deep === false || deep === 0)
      return traverse(source, 1)
    // for `deep: undefined` on a reactive object, deeply traverse all properties
    return traverse(source)
  }

  let effect: ReactiveEffect
  let getter: () => any
  let cleanup: (() => void) | undefined
  let boundCleanup: typeof onWatcherCleanup
  let forceTrigger = false
  let isMultiSource = false

  if (isRef(source)) {
    getter = () => source.value
    forceTrigger = isShallow(source)
  } else if (isReactive(source)) {
    getter = () => reactiveGetter(source)
    forceTrigger = true
  } else if (isArray(source)) {
    isMultiSource = true
    forceTrigger = source.some(s => isReactive(s) || isShallow(s))
    getter = () =>
      source.map(s => {
        if (isRef(s)) {
          return s.value
        } else if (isReactive(s)) {
          return reactiveGetter(s)
        } else if (isFunction(s)) {
          return call ? call(s, WatchErrorCodes.WATCH_GETTER) : s()
        } else {
          __DEV__ && warnInvalidSource(s)
        }
      })
  } else if (isFunction(source)) {
    if (cb) {
      // getter with cb
      getter = call
        ? () => call(source, WatchErrorCodes.WATCH_GETTER)
        : (source as () => any)
    } else {
      // no cb -> simple effect
      getter = () => {
        if (cleanup) {
          pauseTracking()
          try {
            // cleanup 用户定义的函数中应该禁止响应式 track/trigger
            cleanup()
          } finally {
            resetTracking()
          }
        }
        const currentEffect = activeWatcher
        // 每次 getter 执行时, 都会设置这里的 activeWatcher 为当前的 efffect
        // 这样下面执行的 watch((boundCleanup) => { boundCleanup(userCleanupFn) }, null)
        // 用户执行 boundCleanup(userCleanupFn) -> onWatcherCleanup(userCleanupFn, false, effect)
        // 或者直接执行:
        // watch(() => {
        //   // 此时在 watch 函数的 getter 中, 那么此时的 activeWatcher 是存在的,
        //   // 因为这里的 activeWatcher 赋值了, 所以在 onWatcherCleanup 可以读取 activeWatcher
        //   onWatcherCleanup(fn)
        // }, null)
        activeWatcher = effect
        try {
          return call
            ? call(source, WatchErrorCodes.WATCH_CALLBACK, [boundCleanup])
            : source(boundCleanup)
          // fn => onWatcherCleanup(fn, false, effect)
        } finally {
          activeWatcher = currentEffect
        }
      }
    }
  } else {
    getter = NOOP
    __DEV__ && warnInvalidSource(source)
  }

  if (cb && deep) {
    const baseGetter = getter
    const depth = deep === true ? Infinity : deep
    getter = () => traverse(baseGetter(), depth)
  }

  const scope = getCurrentScope()
  const watchHandle: WatchHandle = () => {
    effect.stop()
    // effect.onStop() -> 调用这里的 cleanups 注册的函数
    if (scope && scope.active) {
      remove(scope.effects, effect)
    }
  }

  if (once && cb) {
    const _cb = cb
    cb = (...args) => {
      _cb(...args)
      watchHandle()
    }
  }

  let oldValue: any = isMultiSource
    ? new Array((source as []).length).fill(INITIAL_WATCHER_VALUE)
    : INITIAL_WATCHER_VALUE

  const job = (immediateFirstRun?: boolean) => {
    if (
      !(effect.flags & EffectFlags.ACTIVE) ||
      // effect.dirty -> isDirty(this)
      // 遍历 watch effect 的所有 dep.version 与 link.version对比)包括计算属性的对比
      (!effect.dirty && !immediateFirstRun)
    ) {
      // effect 没有 dirty, 无需执行 watch job
      return
    }
    if (cb) {
      // 如果有回调函数,计算 getter 的新旧值
      // watch(source, cb)
      const newValue = effect.run() // 执行传入的 source
      if (
        deep ||
        forceTrigger ||
        (isMultiSource
          ? (newValue as any[]).some((v, i) => hasChanged(v, oldValue[i]))
          : hasChanged(newValue, oldValue))
      ) {
        // cleanup before running cb again
        if (cleanup) {
          // 执行通过  onWatcherCleanup(fn) 注册的函数
          cleanup()
        }
        const currentWatcher = activeWatcher
        // watcher 的回调函数中 cb 执行前设置当前的 activeEffect, 以便可以在 cb 执行对应的注册函数
        // watch(source, () => {
        //   // 这个回调函数执行前, watch 内部会先执行 cleanup 函数
        //   // 然后当前回调函数的执行上下文设置当前的 activeWatcher = effect, 这样就可以执行
        //   onWatcherCleanup(fn) // 此时这个函数就可以在 cb 上下文中执行, 可以获取 activeWatcher 注册
        //   // cleanup 函数到 activeWatcher 上, 等下一次执行再次执行 cb 时, 就会先执行前一次注册在
        //   // activeWatcher 中的清除函数
        // })
        activeWatcher = effect
        try {
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE
              ? undefined
              : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE
                ? []
                : oldValue,
            // 这里是 cb 回调函数的第 3 个参数 onCleanup
            boundCleanup,
            // boundCleanup(fn) -> onWatcherCleanup(fn) 将清除函数 fn 注册到 boundCleanup 函数定义时
            // 绑定的闭包中 effect 即 activeWatcher 中
            // 等价于在 cb 回调函数中执行 onWatcherCleanup(fn)
          ]
          call
            ? // call 是给 packages/runtime-core/src/apiWatch.ts 中 vue 内部定义的 watch api 调用
              // 里面处理错误处理
              call(cb!, WatchErrorCodes.WATCH_CALLBACK, args)
            : // @ts-expect-error
              // 执行回调函数
              cb!(...args)
          // 用新值更新老值
          oldValue = newValue
        } finally {
          // cb 回调函数执行完后, 恢复 activeWatcher
          activeWatcher = currentWatcher
        }
      }
    } else {
      // watchEffect
      effect.run()
    }
  }

  // 这里估计: 在 packages/runtime-core/src/apiWatch.ts
  // 为 job 设置各种 job 的 flags: PRE, QUEUE, DISPOSE 等
  if (augmentJob) {
    augmentJob(job)
  }

  effect = new ReactiveEffect(getter)

  effect.scheduler = scheduler
    ? () => scheduler(job, false)
    : (job as EffectScheduler)

  boundCleanup = fn => onWatcherCleanup(fn, false, effect)

  cleanup = effect.onStop = () => {
    // watcherEffect 上面是否有注册对应的清除函数
    const cleanups = cleanupMap.get(effect)
    if (cleanups) {
      if (call) {
        call(cleanups, WatchErrorCodes.WATCH_CLEANUP)
      } else {
        for (const cleanup of cleanups) cleanup()
      }
      cleanupMap.delete(effect)
    }
  }

  if (__DEV__) {
    effect.onTrack = options.onTrack
    effect.onTrigger = options.onTrigger
  }

  // initial run
  if (cb) {
    // 同步执行
    if (immediate) {
      job(true)
    } else {
      oldValue = effect.run()
    }
  } else if (scheduler) {
    // 这里的 schedule 是给 packages/runtime-core/src/apiWatch.ts 中使用的
    // 在 apiWatch 中的 watch 就涉及到 queue 的异步执行了
    scheduler(job.bind(null, true), true)
  } else {
    effect.run()
  }

  watchHandle.pause = effect.pause.bind(effect)
  watchHandle.resume = effect.resume.bind(effect)
  watchHandle.stop = watchHandle

  return watchHandle
}

export function traverse(
  value: unknown,
  depth: number = Infinity,
  seen?: Set<unknown>,
): unknown {
  if (depth <= 0 || !isObject(value) || (value as any)[ReactiveFlags.SKIP]) {
    return value
  }

  seen = seen || new Set()
  if (seen.has(value)) {
    return value
  }
  seen.add(value)
  depth--
  if (isRef(value)) {
    traverse(value.value, depth, seen)
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen)
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v: any) => {
      traverse(v, depth, seen)
    })
  } else if (isPlainObject(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen)
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key as any], depth, seen)
      }
    }
  }
  return value
}
